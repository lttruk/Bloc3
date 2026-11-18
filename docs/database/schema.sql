-- Le Grand Cinéma – Modèle physique de données (MySQL 8)
-- Correspond au MCD et au MLD du Dossier 1, Question 2.

CREATE DATABASE IF NOT EXISTS grande_cinema
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE grande_cinema;

CREATE TABLE utilisateur (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom                  VARCHAR(100) NOT NULL,
  prenom               VARCHAR(100) NOT NULL,
  email                VARCHAR(254) NOT NULL UNIQUE,
  mot_de_passe_hash    VARCHAR(255) NOT NULL,
  role                 ENUM('CLIENT','CAISSIER','CONTROLEUR','PROGRAMMATION','ADMIN')
                       NOT NULL DEFAULT 'CLIENT',
  consentement_rgpd_le DATETIME NOT NULL,
  cree_le              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  maj_le               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE film (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  titre          VARCHAR(200) NOT NULL,
  synopsis       TEXT NULL,
  duree_minutes  SMALLINT UNSIGNED NOT NULL,
  genre          VARCHAR(50) NULL,
  classification VARCHAR(30) NULL,
  statut         ENUM('BROUILLON','PUBLIE','ARCHIVE') NOT NULL DEFAULT 'BROUILLON',
  CONSTRAINT chk_film_duree CHECK (duree_minutes > 0)
) ENGINE=InnoDB;

CREATE TABLE salle (
  id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom      VARCHAR(80) NOT NULL UNIQUE,
  capacite SMALLINT UNSIGNED NOT NULL,
  CONSTRAINT chk_salle_capacite CHECK (capacite > 0)
) ENGINE=InnoDB;

CREATE TABLE place (
  id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  salle_id INT UNSIGNED NOT NULL,
  rangee   VARCHAR(5) NOT NULL,
  numero   SMALLINT UNSIGNED NOT NULL,
  type     ENUM('STANDARD','PMR') NOT NULL DEFAULT 'STANDARD',
  active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_place_position (salle_id, rangee, numero),
  CONSTRAINT fk_place_salle FOREIGN KEY (salle_id) REFERENCES salle(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE seance (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  film_id         INT UNSIGNED NOT NULL,
  salle_id        INT UNSIGNED NOT NULL,
  debut           DATETIME NOT NULL,
  fin             DATETIME NOT NULL,
  version         ENUM('VF','VO') NOT NULL DEFAULT 'VF',
  ouverture_vente DATETIME NULL,
  festival        BOOLEAN NOT NULL DEFAULT FALSE,
  statut          ENUM('PROGRAMMEE','PUBLIEE','ANNULEE') NOT NULL DEFAULT 'PROGRAMMEE',
  KEY idx_seance_salle_debut (salle_id, debut),
  KEY idx_seance_debut_statut (debut, statut),
  CONSTRAINT fk_seance_film  FOREIGN KEY (film_id)  REFERENCES film(id)  ON DELETE RESTRICT,
  CONSTRAINT fk_seance_salle FOREIGN KEY (salle_id) REFERENCES salle(id) ON DELETE RESTRICT,
  CONSTRAINT chk_seance_dates CHECK (fin > debut)
) ENGINE=InnoDB;

CREATE TABLE tarif (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  libelle             VARCHAR(50) NOT NULL UNIQUE,
  prix                DECIMAL(6,2) NOT NULL,
  justificatif_requis BOOLEAN NOT NULL DEFAULT FALSE,
  actif               BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT chk_tarif_prix CHECK (prix >= 0)
) ENGINE=InnoDB;

CREATE TABLE reservation (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT UNSIGNED NOT NULL,
  seance_id      INT UNSIGNED NOT NULL,
  reference      CHAR(12) NOT NULL UNIQUE,
  canal          ENUM('WEB','GUICHET') NOT NULL DEFAULT 'WEB',
  statut         ENUM('EN_ATTENTE','CONFIRMEE','ANNULEE','EXPIREE')
                 NOT NULL DEFAULT 'EN_ATTENTE',
  creee_le       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expire_le      DATETIME NULL,
  KEY idx_reservation_expiration (statut, expire_le),
  KEY idx_reservation_utilisateur (utilisateur_id, creee_le),
  CONSTRAINT fk_reservation_utilisateur FOREIGN KEY (utilisateur_id)
    REFERENCES utilisateur(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reservation_seance FOREIGN KEY (seance_id)
    REFERENCES seance(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE billet (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT UNSIGNED NOT NULL,
  seance_id      INT UNSIGNED NOT NULL,
  place_id       INT UNSIGNED NOT NULL,
  tarif_id       INT UNSIGNED NOT NULL,
  prix_applique  DECIMAL(6,2) NOT NULL,
  code_qr        VARCHAR(512) NULL UNIQUE,
  statut         ENUM('ACTIF','UTILISE','ANNULE') NOT NULL DEFAULT 'ACTIF',
  scanne_le      DATETIME NULL,
  -- Vaut 1 tant que le billet occupe la place, NULL une fois annulé
  place_occupee  TINYINT AS (IF(statut = 'ANNULE', NULL, 1)) VIRTUAL,
  UNIQUE KEY uq_billet_place_occupee (seance_id, place_id, place_occupee),
  KEY idx_billet_reservation (reservation_id),
  CONSTRAINT fk_billet_reservation FOREIGN KEY (reservation_id)
    REFERENCES reservation(id) ON DELETE RESTRICT,
  CONSTRAINT fk_billet_seance FOREIGN KEY (seance_id)
    REFERENCES seance(id) ON DELETE RESTRICT,
  CONSTRAINT fk_billet_place FOREIGN KEY (place_id)
    REFERENCES place(id) ON DELETE RESTRICT,
  CONSTRAINT fk_billet_tarif FOREIGN KEY (tarif_id)
    REFERENCES tarif(id) ON DELETE RESTRICT,
  CONSTRAINT chk_billet_prix CHECK (prix_applique >= 0)
) ENGINE=InnoDB;

CREATE TABLE paiement (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id      INT UNSIGNED NOT NULL,
  ref_transaction_psp VARCHAR(100) NOT NULL UNIQUE,
  montant             DECIMAL(8,2) NOT NULL,
  statut              ENUM('INITIE','ACCEPTE','REFUSE','REMBOURSE')
                      NOT NULL DEFAULT 'INITIE',
  paye_le             DATETIME NULL,
  cree_le             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_paiement_reservation FOREIGN KEY (reservation_id)
    REFERENCES reservation(id) ON DELETE RESTRICT,
  CONSTRAINT chk_paiement_montant CHECK (montant >= 0)
) ENGINE=InnoDB;
