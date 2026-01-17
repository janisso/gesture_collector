-- Stage 2 will define the full schema.
-- This placeholder exists so the repo structure matches staged_plan.md.

-- MySQL 5.7 schema for the gesture collector study.
-- Run this inside the MySQL container or against the dev DB.

-- Optional: create a dedicated app user (adjust password/host as needed)
-- CREATE USER 'gesture_app'@'%' IDENTIFIED BY 'replace-me';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON gesture_study.* TO 'gesture_app'@'%';

CREATE DATABASE IF NOT EXISTS gesture_study CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gesture_study;

CREATE TABLE IF NOT EXISTS sessions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    study_id VARCHAR(128) NOT NULL,
    study_version VARCHAR(64) NOT NULL,
    schema_version INT NOT NULL,
    consent_version VARCHAR(64) NULL,
    user_agent VARCHAR(512) NULL,
    capabilities_json LONGTEXT NULL,
    metadata_json LONGTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trials (
    id CHAR(36) NOT NULL PRIMARY KEY, -- trial_id (idempotent key)
    session_id CHAR(36) NOT NULL,
    study_id VARCHAR(128) NOT NULL,
    study_version VARCHAR(64) NOT NULL,
    schema_version INT NOT NULL,
    trial_index INT NOT NULL,
    stimulus_id VARCHAR(128) NULL,
    t_start_perf_ms DOUBLE NOT NULL,
    t_end_perf_ms DOUBLE NOT NULL,
    survey_json LONGTEXT NULL,
    diagnostics_json LONGTEXT NULL,
    samples_json LONGTEXT NOT NULL,
    sample_count INT NOT NULL,
    duration_ms DOUBLE NOT NULL,
    effective_hz DOUBLE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trials_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    INDEX idx_trials_session (session_id),
    INDEX idx_trials_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
