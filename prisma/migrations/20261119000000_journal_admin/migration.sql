-- US-7.1 : journal des modifications faites depuis le back-office (qui, quoi, quand)

CREATE TABLE journal_admin (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT UNSIGNED NOT NULL,
  action         VARCHAR(40) NOT NULL,
  entite         ENUM('FILM','SEANCE') NOT NULL,
  entite_id      INT UNSIGNED NOT NULL,
  details        JSON NULL,
  cree_le        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_journal_entite (entite, entite_id),
  KEY idx_journal_date (cree_le),
  CONSTRAINT fk_journal_utilisateur FOREIGN KEY (utilisateur_id)
    REFERENCES utilisateur(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
