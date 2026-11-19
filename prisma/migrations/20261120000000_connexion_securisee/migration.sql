-- US-2.2 : blocage temporaire après 5 échecs, journal des connexions et jetons de rafraîchissement

ALTER TABLE utilisateur
  ADD COLUMN echecs_connexion TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN bloque_jusqu_a DATETIME NULL;

CREATE TABLE journal_connexion (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT UNSIGNED NULL,
  resultat       ENUM('SUCCES','ECHEC','BLOQUE') NOT NULL,
  ip_tronquee    VARCHAR(45) NULL,
  cree_le        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_journal_connexion_utilisateur (utilisateur_id, cree_le),
  KEY idx_journal_connexion_date (cree_le),
  CONSTRAINT fk_journal_connexion_utilisateur FOREIGN KEY (utilisateur_id)
    REFERENCES utilisateur(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE jeton_rafraichissement (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT UNSIGNED NOT NULL,
  empreinte      CHAR(64) NOT NULL,
  expire_le      DATETIME NOT NULL,
  revoque_le     DATETIME NULL,
  cree_le        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_jeton_empreinte (empreinte),
  KEY idx_jeton_utilisateur (utilisateur_id),
  CONSTRAINT fk_jeton_utilisateur FOREIGN KEY (utilisateur_id)
    REFERENCES utilisateur(id) ON DELETE CASCADE
) ENGINE=InnoDB;
