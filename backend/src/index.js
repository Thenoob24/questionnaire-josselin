const express = require('express');
const cors = require('cors');
const { getAnswersCount, getAnswers, addAnswer, voteAnswer } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

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
