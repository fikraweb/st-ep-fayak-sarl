CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS photos (
 id TEXT PRIMARY KEY, service TEXT NOT NULL, object_key TEXT, url TEXT NOT NULL,
 caption_fr TEXT NOT NULL DEFAULT '', caption_ar TEXT NOT NULL DEFAULT '',
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), sort_order INTEGER NOT NULL DEFAULT 0,
 bytes INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_service ON photos(service,published,sort_order);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, password_version TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (ip_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, created_at INTEGER NOT NULL);
INSERT OR IGNORE INTO photos (id,service,url,caption_fr,caption_ar,published,sort_order,created_at) VALUES
 ('seed-electric','electric','/assets/services/electricite-generale-industrielle.webp','Installation électrique','تجهيز كهربائي',1,0,0),
 ('seed-heat','heat','/assets/services/chauffage-central.webp','Installation de chauffage central','تجهيز التدفئة المركزية',1,1,0),
 ('seed-pool','pool','/assets/services/piscines-equipees.webp','Piscine équipée','مسبح مجهز',1,2,0);
