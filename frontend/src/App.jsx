import React, { useState, useEffect } from 'react';

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return dateStr;
  }
}

export default function App() {
  const [question, setQuestion] = useState('Chargement de la question...');
  const [answersCount, setAnswersCount] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [author, setAuthor] = useState('');
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: string }
  const [loading, setLoading] = useState(true);

  // Mémorisation locale des votes de l'utilisateur : { [answerId]: 'like' | 'dislike' }
  const [userVotes, setUserVotes] = useState(() => {
    try {
      const saved = localStorage.getItem('questionnaire_user_votes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Charger la question et les réponses
  const fetchData = async () => {
    try {
      const [resQuestion, resAnswers] = await Promise.all([
        fetch('/api/question'),
        fetch('/api/answers'),
      ]);

      if (resQuestion.ok) {
        const dataQuestion = await resQuestion.json();
        setQuestion(dataQuestion.question || 'Question');
        setAnswersCount(typeof dataQuestion.count === 'number' ? dataQuestion.count : 0);
      }

      if (resAnswers.ok) {
        const dataAnswers = await resAnswers.json();
        setAnswers(Array.isArray(dataAnswers) ? dataAnswers : []);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des données :', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);

    const trimmedBody = body.trim();
    const trimmedAuthor = author.trim();

    if (trimmedAuthor.length > 80) {
      setFeedback({
        type: 'error',
        message: 'Le nom ne doit pas dépasser 80 caractères.',
      });
      return;
    }

    if (trimmedBody.length < 2) {
      setFeedback({
        type: 'error',
        message: 'La réponse doit contenir au moins 2 caractères.',
      });
      return;
    }

    if (trimmedBody.length > 2000) {
      setFeedback({
        type: 'error',
        message: 'La réponse ne doit pas dépasser 2000 caractères.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/answers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          author: trimmedAuthor || 'Anonyme',
          body: trimmedBody,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({
          type: 'error',
          message: data.error || 'Une erreur est survenue lors de l’enregistrement.',
        });
        return;
      }

      // Succès : mise à jour immédiate de la liste et du compteur
      setAnswers((prev) => [data, ...prev]);
      setAnswersCount((prev) => prev + 1);
      setBody('');
      setAuthor('');
      setFeedback({
        type: 'success',
        message: 'Votre réponse a été publiée avec succès !',
      });
    } catch (err) {
      console.error('Erreur réseau :', err);
      setFeedback({
        type: 'error',
        message: 'Impossible de joindre le serveur. Veuillez réessayer ultérieurement.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Gestion des pouces Like et Dislike
  const handleVote = async (answerId, targetVoteType) => {
    const currentVote = userVotes[answerId] || null;
    // Si on reclique sur le même pouce, on retire le vote
    const newVote = currentVote === targetVoteType ? null : targetVoteType;

    // Calcul du delta pour mise à jour optimiste
    let deltaLikes = 0;
    let deltaDislikes = 0;

    if (currentVote === 'like') deltaLikes -= 1;
    if (currentVote === 'dislike') deltaDislikes -= 1;

    if (newVote === 'like') deltaLikes += 1;
    if (newVote === 'dislike') deltaDislikes += 1;

    // Mise à jour de l'état local et de localStorage
    const updatedVotes = { ...userVotes };
    if (newVote) {
      updatedVotes[answerId] = newVote;
    } else {
      delete updatedVotes[answerId];
    }
    setUserVotes(updatedVotes);
    try {
      localStorage.setItem('questionnaire_user_votes', JSON.stringify(updatedVotes));
    } catch (err) {
      console.error('Erreur de stockage localStorage :', err);
    }

    // Mise à jour optimiste des compteurs dans l'interface
    setAnswers((prev) =>
      prev.map((ans) => {
        if (ans.id === answerId) {
          return {
            ...ans,
            likes: Math.max(0, (ans.likes || 0) + deltaLikes),
            dislikes: Math.max(0, (ans.dislikes || 0) + deltaDislikes),
          };
        }
        return ans;
      })
    );

    // Envoi de la requête au serveur
    try {
      const res = await fetch(`/api/answers/${answerId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: newVote,
          previous: currentVote,
        }),
      });

      if (res.ok) {
        const serverUpdated = await res.json();
        setAnswers((prev) =>
          prev.map((ans) => (ans.id === answerId ? { ...ans, ...serverUpdated } : ans))
        );
      }
    } catch (err) {
      console.error('Erreur lors du vote :', err);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <div className="badge">
          {answersCount === 0
            ? 'Aucune réponse'
            : answersCount === 1
            ? '1 réponse enregistrée'
            : `${answersCount} réponses enregistrées`}
        </div>
        <h1 className="question-title">{question}</h1>
      </header>

      <main className="main-content">
        {/* Formulaire de réponse */}
        <section className="card form-card">
          <h2 className="section-title">Partager votre réponse</h2>

          {feedback && (
            <div
              className={`alert ${
                feedback.type === 'success' ? 'alert-success' : 'alert-error'
              }`}
              role="alert"
            >
              {feedback.type === 'success' ? '✓ ' : '✕ '}
              {feedback.message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="answer-form">
            <div className="form-group">
              <label htmlFor="author-input" className="form-label">
                Votre nom ou pseudo <span className="optional">(facultatif)</span>
              </label>
              <input
                id="author-input"
                type="text"
                className="form-input"
                placeholder="Ex. Alex (ou laisser vide pour Anonyme)"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                maxLength={80}
                disabled={isSubmitting}
              />
              <span className="field-hint">Maximum 80 caractères</span>
            </div>

            <div className="form-group">
              <div className="label-with-counter">
                <label htmlFor="body-input" className="form-label">
                  Votre réponse <span className="required">*</span>
                </label>
                <span className="char-counter">
                  {body.trim().length} / 2000
                </span>
              </div>
              <textarea
                id="body-input"
                className="form-textarea"
                rows={5}
                placeholder="Rédigez votre réponse ici (au moins 2 caractères)..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={2000}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="submit-button"
                disabled={isSubmitting || body.trim().length < 2}
              >
                {isSubmitting ? 'Envoi en cours...' : 'Envoyer ma réponse'}
              </button>
            </div>
          </form>
        </section>

        {/* Liste des réponses */}
        <section className="answers-section">
          <h2 className="section-title">
            Réponses envoyées
            <span className="count-tag">({answers.length})</span>
          </h2>

          {loading ? (
            <div className="empty-state">Chargement des réponses...</div>
          ) : answers.length === 0 ? (
            <div className="empty-state">
              <p>Aucune réponse pour le moment.</p>
              <p className="empty-sub">Soyez le premier à donner votre avis ci-dessus !</p>
            </div>
          ) : (
            <div className="answers-list">
              {answers.map((item) => {
                const currentVote = userVotes[item.id];
                return (
                  <article key={item.id} className="card answer-card">
                    <header className="answer-header">
                      <div className="avatar">
                        {(item.author || 'A').charAt(0).toUpperCase()}
                      </div>
                      <div className="answer-meta">
                        <strong className="answer-author">
                          {item.author || 'Anonyme'}
                        </strong>
                        <time className="answer-date" dateTime={item.createdAt}>
                          {formatDate(item.createdAt)}
                        </time>
                      </div>
                    </header>

                    <p className="answer-body">{item.body}</p>

                    <footer className="answer-footer">
                      <div className="vote-actions">
                        <button
                          type="button"
                          className={`vote-btn like-btn ${
                            currentVote === 'like' ? 'voted' : ''
                          }`}
                          onClick={() => handleVote(item.id, 'like')}
                          title={
                            currentVote === 'like'
                              ? 'Retirer mon like'
                              : "J'aime cette réponse (👍)"
                          }
                          aria-label="Pouce vers le haut (Like)"
                        >
                          <span className="vote-icon">👍</span>
                          <span className="vote-count">{item.likes || 0}</span>
                        </button>

                        <button
                          type="button"
                          className={`vote-btn dislike-btn ${
                            currentVote === 'dislike' ? 'voted' : ''
                          }`}
                          onClick={() => handleVote(item.id, 'dislike')}
                          title={
                            currentVote === 'dislike'
                              ? 'Retirer mon dislike'
                              : "Je n'aime pas cette réponse (👎)"
                          }
                          aria-label="Pouce vers le bas (Dislike)"
                        >
                          <span className="vote-icon">👎</span>
                          <span className="vote-count">{item.dislikes || 0}</span>
                        </button>
                      </div>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>Application de questionnaire collaborative</p>
      </footer>
    </div>
  );
}
