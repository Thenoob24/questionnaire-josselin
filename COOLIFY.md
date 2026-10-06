# Déploiement sur un serveur Coolify

Ce guide vous explique étape par étape comment déployer votre application de questionnaire sur votre instance **Coolify**.

---

## Pourquoi cette configuration est prête pour Coolify

- **Sans conflits de noms** : Aucun `container_name` fixe n'est utilisé, ce qui permet à Coolify d'effectuer des mises à jour sans interruption (*zero-downtime rolling updates*).
- **Healthchecks intégrés** : Les conteneurs disposent de sondes de santé (`healthcheck`) pour s'assurer que l'API et le front sont prêts avant que le proxy de Coolify ne leur envoie du trafic.
- **Reverse Proxy natif** : Coolify gère le domaine public et le certificat SSL (HTTPS) directement en ciblant le conteneur `web` sur le port interne `80`.
- **Persistance garantie** : Le volume nommé `answers` conserve la base SQLite (`/data/answers.sqlite`) entre les redéploiements.

---

## Méthode 1 : Déploiement via Git (Recommandé)

### 1. Pousser votre projet sur un dépôt Git
Assurez-vous que votre projet est présent sur votre compte GitHub, GitLab ou Gitea.

### 2. Créer une nouvelle ressource dans Coolify
1. Dans votre tableau de bord Coolify, entrez dans votre **Projet** et votre **Environnement**.
2. Cliquez sur **+ New** (ou **Add resource**).
3. Choisissez **Git Repository** (GitHub, GitLab, etc.).
4. Sélectionnez votre dépôt et la branche (ex: `main`).

### 3. Sélectionner le Build Pack
- Coolify détectera votre configuration ou vous proposera de choisir un Build Pack : sélectionnez **Docker Compose**.
- Par défaut, Coolify utilise `docker-compose.yml`. Si vous souhaitez utiliser le fichier dédié sans mapping de port hôte direct, définissez **Docker Compose Location** sur `docker-compose.coolify.yml`.

### 4. Configurer le domaine (FQDN)
1. Dans la liste des services détectés par Coolify, cliquez sur le service **`web`**.
2. Dans le champ **Domains**, entrez l'URL publique souhaitée, par exemple :
   ```
   https://questionnaire.votre-domaine.com
   ```
3. Coolify configure automatiquement Traefik et génère le certificat SSL Let's Encrypt gratuit.

### 5. Configurer les variables d'environnement
1. Allez dans l'onglet **Environment Variables** de votre ressource dans Coolify.
2. Ajoutez votre question et votre mot de passe modérateur :
   ```env
   QUESTION=Votre question personnalisée ici ?
   MODERATOR_PASSWORD=votre_mot_de_passe_secret
   ```
3. Sauvegardez.

### 6. Déployer
- Cliquez sur le bouton **Deploy**.
- Suivez les logs de compilation et de déploiement.
- Une fois le déploiement terminé, ouvrez votre domaine : votre application est en ligne en HTTPS !

---

## Méthode 2 : Déploiement local ou VPS classique

Si vous testez en local ou sans Coolify :

```bash
# Copier l'environnement
cp .env.example .env

# Lancer
docker compose up --build
```

L'application sera accessible sur `http://localhost:8080`.
