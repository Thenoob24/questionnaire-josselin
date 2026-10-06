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

  // État de modération
  const [moderatorToken, setModeratorToken] = useState(() => {
    try {
      return sessionStorage.getItem('moderator_token') || null;
    } catch {
      return null;
    }
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [editingAnswer, setEditingAnswer] = useState(null); // { id, author, body } ou null

  // Mémorisation locale des votes : { [answerId]: 'like' | 'dislike' }
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

  // Soumission : création d'une réponse ou enregistrement d'une modification
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
      // Cas 1 : Modification en mode modérateur (PATCH)
      if (editingAnswer) {
        const res = await fetch(`/api/answers/${editingAnswer.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${moderatorToken}`,
          },
          body: JSON.stringify({
            author: trimmedAuthor || 'Anonyme',
            body: trimmedBody,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (res.status === 401) {
            handleLogoutModeration();
            setFeedback({
              type: 'error',
              message: 'Session de modération expirée. Veuillez vous reconnecter.',
            });
            return;
          }
          setFeedback({
            type: 'error',
            message: data.error || 'Erreur lors de la modification.',
          });
          return;
        }

        // Succès de la modification
        setEditingAnswer(null);
        setBody('');
        setAuthor('');
        setFeedback({
          type: 'success',
          message: 'La réponse a été modifiée avec succès.',
        });
        await fetchData();
        return;
      }

      // Cas 2 : Création normale par un visiteur (POST)
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

      // Succès création
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

  // Connexion modérateur
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 503) {
          setLoginError('La modération n’est pas configurée sur ce serveur (MODERATOR_PASSWORD non défini).');
        } else {
          setLoginError('Mot de passe incorrect.');
        }
        return;
      }

      // Succès : enregistrement du jeton dans sessionStorage
      try {
        sessionStorage.setItem('moderator_token', data.token);
      } catch (e) {
        console.error(e);
      }
      setModeratorToken(data.token);
      setShowLoginModal(false);
      setLoginPassword('');
      setFeedback({
        type: 'success',
        message: 'Mode modération activé (valable 8 heures).',
      });
    } catch (err) {
      setLoginError('Impossible de joindre le serveur.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Déconnexion modérateur
  const handleLogoutModeration = () => {
    try {
      sessionStorage.removeItem('moderator_token');
    } catch (e) {
      console.error(e);
    }
    setModeratorToken(null);
    handleCancelEdit();
    setFeedback({
      type: 'success',
      message: 'Vous avez quitté le mode modération.',
    });
  };

  // Démarrer la modification d'une réponse
  const handleStartEdit = (item) => {
    setEditingAnswer(item);
    setAuthor(item.author === 'Anonyme' ? '' : item.author);
    setBody(item.body);
    setFeedback(null);
    const formSection = document.getElementById('form-card');
    if (formSection) {
      formSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Annuler la modification
  const handleCancelEdit = () => {
    setEditingAnswer(null);
    setAuthor('');
    setBody('');
  };

  // Supprimer une réponse (avec confirmation)
  const handleDeleteAnswer = async (id) => {
    if (!window.confirm('Voulez-vous vraiment supprimer définitivement cette réponse ?')) {
      return;
    }

    try {
      const res = await fetch(`/api/answers/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${moderatorToken}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          handleLogoutModeration();
          setFeedback({
            type: 'error',
            message: 'Session de modération expirée. Veuillez vous reconnecter.',
          });
          return;
        }
        const data = await res.json();
        setFeedback({
          type: 'error',
          message: data.error || 'Erreur lors de la suppression.',
        });
        return;
      }

      if (editingAnswer && editingAnswer.id === id) {
        handleCancelEdit();
      }

      setFeedback({
        type: 'success',
        message: 'Réponse supprimée avec succès.',
      });
      await fetchData();
    } catch (err) {
      console.error('Erreur suppression :', err);
      setFeedback({
        type: 'error',
        message: 'Erreur réseau lors de la suppression.',
      });
    }
  };

  // Gestion des pouces Like et Dislike
  const handleVote = async (answerId, targetVoteType) => {
    const currentVote = userVotes[answerId] || null;
    const newVote = currentVote === targetVoteType ? null : targetVoteType;

    let deltaLikes = 0;
    let deltaDislikes = 0;

    if (currentVote === 'like') deltaLikes -= 1;
    if (currentVote === 'dislike') deltaDislikes -= 1;

    if (newVote === 'like') deltaLikes += 1;
    if (newVote === 'dislike') deltaDislikes += 1;

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
      {/* Barre d'état modération si connecté */}
      {moderatorToken && (
        <aside className="moderator-banner" aria-label="Espace modérateur">
          <div className="moderator-status">
            <span className="moderator-icon">🛡️</span>
            <strong>Mode modération actif</strong>
          </div>
          <button
            type="button"
            className="btn-logout-mod"
            onClick={handleLogoutModeration}
          >
            Quitter la modération
          </button>
        </aside>
      )}

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
        {/* Formulaire de réponse (création ou modification) */}
        <section className="card form-card" id="form-card">
          <div className="form-header">
            <h2 className="section-title">
              {editingAnswer
                ? `Modifier la réponse #${editingAnswer.id}`
                : 'Partager votre réponse'}
            </h2>
            {editingAnswer && (
              <span className="editing-tag">Mode modification</span>
            )}
          </div>

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
              {editingAnswer && (
                <button
                  type="button"
                  className="cancel-button"
                  onClick={handleCancelEdit}
                  disabled={isSubmitting}
                >
                  Annuler
                </button>
              )}
              <button
                type="submit"
                className="submit-button"
                disabled={isSubmitting || body.trim().length < 2}
              >
                {isSubmitting
                  ? 'Enregistrement...'
                  : editingAnswer
                  ? 'Enregistrer'
                  : 'Envoyer ma réponse'}
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
                const isBeingEdited = editingAnswer && editingAnswer.id === item.id;
                return (
                  <article
                    key={item.id}
                    className={`card answer-card ${isBeingEdited ? 'card-editing' : ''}`}
                  >
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

                      {/* Actions modérateur dans l'en-tête de la carte */}
                      {moderatorToken && (
                        <div className="moderator-card-actions">
                          <button
                            type="button"
                            className="mod-btn mod-edit-btn"
                            onClick={() => handleStartEdit(item)}
                            title="Modifier cette réponse"
                          >
                            ✏️ Modifier
                          </button>
                          <button
                            type="button"
                            className="mod-btn mod-delete-btn"
                            onClick={() => handleDeleteAnswer(item.id)}
                            title="Supprimer cette réponse"
                          >
                            🗑️ Supprimer
                          </button>
                        </div>
                      )}
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

      {/* Modal de connexion modérateur */}
      {showLoginModal && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setShowLoginModal(false);
            setLoginError(null);
            setLoginPassword('');
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <h3 id="modal-title" className="modal-title">
              Accès modération
            </h3>
            <p className="modal-desc">
              Entrez le mot de passe de modération pour modifier ou supprimer des réponses.
            </p>

            {loginError && (
              <div className="alert alert-error" role="alert">
                ✕ {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="modal-form">
              <input
                type="password"
                className="form-input"
                placeholder="Mot de passe"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoFocus
                disabled={loginLoading}
                required
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => {
                    setShowLoginModal(false);
                    setLoginError(null);
                    setLoginPassword('');
                  }}
                  disabled={loginLoading}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="submit-button"
                  disabled={loginLoading || !loginPassword}
                >
                  {loginLoading ? 'Vérification...' : 'Se connecter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer avec lien discret de modération */}
      <footer className="footer">
        <p>Application de questionnaire collaborative</p>
        <div className="footer-links">
          {!moderatorToken ? (
            <button
              type="button"
              className="discreet-mod-link"
              onClick={() => {
                setLoginError(null);
                setShowLoginModal(true);
              }}
            >
              🔒 Modération
            </button>
          ) : (
            <button
              type="button"
              className="discreet-mod-link mod-active-link"
              onClick={handleLogoutModeration}
            >
              🔓 Quitter la modération
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
