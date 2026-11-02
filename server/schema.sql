-- 宝宝簿 BabyBook · MySQL schema
-- 全部使用 utf8mb4，日期字段以 DATE 存储，应用层统一按 Asia/Shanghai 处理

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(64)  NOT NULL DEFAULT '',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) NOT NULL,
  v TEXT        NOT NULL,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS babies (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(64)  NOT NULL,
  nickname        VARCHAR(64)  NOT NULL DEFAULT '',
  gender          ENUM('male','female','unknown') NOT NULL DEFAULT 'unknown',
  due_date        DATE         NULL COMMENT '预产期',
  birth_date      DATE         NULL COMMENT '出生日期，未出生为空',
  birth_time      TIME         NULL,
  birth_weight_g  INT          NULL COMMENT '出生体重（克）',
  birth_length_cm DECIMAL(5,2) NULL,
  birth_head_cm   DECIMAL(5,2) NULL,
  delivery_method VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '顺产/剖宫产/…',
  birth_hospital  VARCHAR(128) NOT NULL DEFAULT '',
  apgar_1         TINYINT      NULL,
  apgar_5         TINYINT      NULL,
  blood_type      VARCHAR(16)  NOT NULL DEFAULT '',
  avatar          VARCHAR(255) NOT NULL DEFAULT '',
  notes           TEXT         NULL,
  archived        TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_babies_birth (birth_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prenatal_visits (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  baby_id          INT UNSIGNED NOT NULL,
  visit_date       DATE         NOT NULL,
  gest_days        SMALLINT     NULL COMMENT '当日孕龄（天），由预产期推算',
  visit_type       VARCHAR(32)  NOT NULL DEFAULT '常规产检',
  hospital         VARCHAR(128) NOT NULL DEFAULT '',
  department       VARCHAR(64)  NOT NULL DEFAULT '',
  weight_kg        DECIMAL(5,2) NULL,
  systolic         SMALLINT     NULL,
  diastolic        SMALLINT     NULL,
  fundal_height_cm DECIMAL(4,1) NULL COMMENT '宫高',
  abdominal_cm     DECIMAL(4,1) NULL COMMENT '腹围',
  fetal_heart_rate SMALLINT     NULL COMMENT '胎心（次/分）',
  items            VARCHAR(255) NOT NULL DEFAULT '' COMMENT '检查项目，逗号分隔',
  summary          TEXT         NULL COMMENT '结果与医生建议',
  next_visit_date  DATE         NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_prenatal_baby (baby_id, visit_date),
  CONSTRAINT fk_prenatal_baby FOREIGN KEY (baby_id) REFERENCES babies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vaccine_defs (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code       VARCHAR(32)  NOT NULL,
  name       VARCHAR(64)  NOT NULL,
  dose_no    TINYINT UNSIGNED NOT NULL,
  age_months SMALLINT     NOT NULL COMMENT '推荐接种月龄',
  age_label  VARCHAR(32)  NOT NULL,
  category   ENUM('nepi','self') NOT NULL DEFAULT 'nepi',
  notes      VARCHAR(255) NOT NULL DEFAULT '',
  sort_order SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_vaccine_def (code, dose_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vaccinations (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  baby_id      INT UNSIGNED NOT NULL,
  def_code     VARCHAR(32)  NULL COMMENT '为空表示手动添加的自定义疫苗',
  name         VARCHAR(64)  NOT NULL,
  dose_no      TINYINT UNSIGNED NOT NULL DEFAULT 1,
  category     ENUM('nepi','self','other') NOT NULL DEFAULT 'nepi',
  planned_date DATE         NULL,
  status       ENUM('pending','done','skipped') NOT NULL DEFAULT 'pending',
  done_date    DATE         NULL,
  batch_no     VARCHAR(64)  NOT NULL DEFAULT '',
  manufacturer VARCHAR(64)  NOT NULL DEFAULT '',
  clinic       VARCHAR(128) NOT NULL DEFAULT '',
  reaction     VARCHAR(255) NOT NULL DEFAULT '',
  notes        VARCHAR(255) NOT NULL DEFAULT '',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_vaccination (baby_id, def_code, dose_no),
  KEY idx_vacc_baby_status (baby_id, status),
  CONSTRAINT fk_vacc_baby FOREIGN KEY (baby_id) REFERENCES babies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS growth_records (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  baby_id     INT UNSIGNED NOT NULL,
  measured_on DATE         NOT NULL,
  weight_kg   DECIMAL(5,2) NULL,
  height_cm   DECIMAL(5,2) NULL,
  head_cm     DECIMAL(5,2) NULL,
  note        VARCHAR(255) NOT NULL DEFAULT '',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_growth_baby (baby_id, measured_on),
  CONSTRAINT fk_growth_baby FOREIGN KEY (baby_id) REFERENCES babies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS events (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  baby_id    INT UNSIGNED NOT NULL,
  title      VARCHAR(128) NOT NULL,
  event_date DATE         NOT NULL,
  kind       ENUM('checkup','milestone','other') NOT NULL DEFAULT 'other',
  done       TINYINT(1)   NOT NULL DEFAULT 0,
  notes      VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_baby (baby_id, event_date),
  CONSTRAINT fk_events_baby FOREIGN KEY (baby_id) REFERENCES babies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
