const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const {
  getAnswersCount,
  getAnswers,
  addAnswer,
  updateAnswer,
  deleteAnswer,
  voteAnswer,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Sel de session serveur pour la signature des jetons
const SERVER_SALT = crypto.randomBytes(32).toString('hex');

function getSigningKey() {
  const password = process.env.MODERATOR_PASSWORD;
  if (!password || !password.trim()) return null;
  return crypto.createHmac('sha256', SERVER_SALT).update(password).digest();
}

function generateToken() {
  const key = getSigningKey();
  if (!key) return null;
  const payload = {
    role: 'moderator',
    exp: Date.now() + 8 * 60 * 60 * 1000, // Valable 8 heures
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

function verifyToken(token) {
  const key = getSigningKey();
  if (!key || !token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts;

  const expectedSignature = crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) {
      return false;
    }
    return payload;
  } catch {
    return false;
  }
}

// Middleware de vérification du rôle modérateur
function requireModerator(req, res, next) {
  const moderatorPassword = process.env.MODERATOR_PASSWORD;
  if (!moderatorPassword || !moderatorPassword.trim()) {
    return res.status(503).json({ error: 'La modération n’est pas configurée sur ce serveur.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Accès non autorisé.' });
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Jeton invalide ou expiré.' });
  }

  req.moderator = payload;
  next();
}

// La question provient de la variable d'environnement QUESTION
const getQuestion = () => process.env.QUESTION || 'Que pensez-vous de cette initiative ?';

app.use(cors());
app.use(express.json());

// Endpoint GET /api/question
// Renvoie la question et le nombre total de réponses
app.get('/api/question', (req, res) => {
  try {
    const question = getQuestion();
    const count = getAnswersCount();
    res.json({ question, count });
  } catch (error) {
    console.error('Erreur lors de la récupération de la question :', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Endpoint GET /api/answers
// Renvoie la liste des réponses, les plus récentes en premier
app.get('/api/answers', (req, res) => {
  try {
    const answers = getAnswers();
    res.json(answers);
  } catch (error) {
    console.error('Erreur lors de la récupération des réponses :', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Endpoint POST /api/answers
// Enregistre une nouvelle réponse
app.post('/api/answers', (req, res) => {
  try {
    let { author, body } = req.body || {};

    // Traitement de l'auteur (facultatif, "Anonyme" par défaut, max 80 caractères)
    if (typeof author === 'string') {
      author = author.trim();
    }
    if (!author) {
      author = 'Anonyme';
    }
    if (author.length > 80) {
      return res.status(400).json({
        error: 'Le nom ne doit pas dépasser 80 caractères.'
      });
    }

    // Traitement du corps de la réponse (obligatoire, 2 à 2000 caractères)
    if (typeof body !== 'string') {
      return res.status(400).json({
        error: 'Une réponse valide est obligatoire.'
      });
    }

    body = body.trim();
    if (body.length < 2 || body.length > 2000) {
      return res.status(400).json({
        error: 'La réponse doit contenir entre 2 et 2000 caractères.'
      });
    }

    const newAnswer = addAnswer(author, body);
    res.status(201).json(newAnswer);
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de la réponse :', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Endpoint POST /api/auth
// Vérifie le mot de passe de modération et renvoie un jeton signé valable 8 heures
app.post('/api/auth', (req, res) => {
  const moderatorPassword = process.env.MODERATOR_PASSWORD;
  if (!moderatorPassword || !moderatorPassword.trim()) {
    return res.status(503).json({ error: 'La modération n’est pas configurée sur ce serveur.' });
  }

  const { password } = req.body || {};
  if (typeof password !== 'string' || !password) {
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }

  // Comparaison à temps constant contre les attaques temporelles (timing attacks)
  const userHash = crypto.createHash('sha256').update(password).digest();
  const realHash = crypto.createHash('sha256').update(moderatorPassword).digest();

  if (!crypto.timingSafeEqual(userHash, realHash)) {
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }

  const token = generateToken();
  res.json({ token, expiresIn: 8 * 3600 });
});

// Endpoint PATCH /api/answers/:id (Modération)
// Modifie l'auteur et/ou le corps de la réponse
app.patch('/api/answers/:id', requireModerator, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalide' });

    let { author, body } = req.body || {};

    if (author !== undefined) {
      if (typeof author === 'string') author = author.trim();
      if (!author) author = 'Anonyme';
      if (author.length > 80) {
        return res.status(400).json({ error: 'Le nom ne doit pas dépasser 80 caractères.' });
      }
    }

    if (body !== undefined) {
      if (typeof body !== 'string') {
        return res.status(400).json({ error: 'Réponse invalide.' });
      }
      body = body.trim();
      if (body.length < 2 || body.length > 2000) {
        return res.status(400).json({ error: 'La réponse doit contenir entre 2 et 2000 caractères.' });
      }
    }

    if (author === undefined && body === undefined) {
      return res.status(400).json({ error: 'Aucune donnée à modifier.' });
    }

    const updated = updateAnswer(id, author, body);
    if (!updated) {
      return res.status(404).json({ error: 'Réponse introuvable' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Erreur lors de la modification de la réponse :', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Endpoint DELETE /api/answers/:id (Modération)
// Supprime définitivement une réponse
app.delete('/api/answers/:id', requireModerator, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalide' });

    const deleted = deleteAnswer(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Réponse introuvable' });
    }

    res.json({ success: true, id });
  } catch (error) {
    console.error('Erreur lors de la suppression de la réponse :', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Endpoint POST /api/answers/:id/vote
// Gère le like, dislike ou annulation d'un vote
app.post('/api/answers/:id/vote', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID de réponse invalide' });
    }

    const { type, previous } = req.body || {};
    if (type !== undefined && type !== null && type !== 'like' && type !== 'dislike') {
      return res.status(400).json({ error: 'Type de vote invalide ("like", "dislike" ou null)' });
    }

    const updatedAnswer = voteAnswer(id, type || null, previous || null);
    if (!updatedAnswer) {
      return res.status(404).json({ error: 'Réponse introuvable' });
    }

    res.json(updatedAnswer);
  } catch (error) {
    console.error('Erreur lors du vote :', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Alias direct POST /api/answers/:id/like
app.post('/api/answers/:id/like', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID de réponse invalide' });
    }
    const { previous } = req.body || {};
    const updatedAnswer = voteAnswer(id, 'like', previous || null);
    if (!updatedAnswer) {
      return res.status(404).json({ error: 'Réponse introuvable' });
    }
    res.json(updatedAnswer);
  } catch (error) {
    console.error('Erreur lors du like :', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Alias direct POST /api/answers/:id/dislike
app.post('/api/answers/:id/dislike', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID de réponse invalide' });
    }
    const { previous } = req.body || {};
    const updatedAnswer = voteAnswer(id, 'dislike', previous || null);
    if (!updatedAnswer) {
      return res.status(404).json({ error: 'Réponse introuvable' });
    }
    res.json(updatedAnswer);
  } catch (error) {
    console.error('Erreur lors du dislike :', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Gestion des routes non trouvées
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend API démarré sur le port ${PORT}`);
  console.log(`Question actuelle : "${getQuestion()}"`);
});
