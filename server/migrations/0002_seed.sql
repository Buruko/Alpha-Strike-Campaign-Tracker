-- Seed: PSA definitions + default GM user
-- GM password hash is bcrypt of 'changeme' — CHANGE ON FIRST LOGIN via Admin page
-- To regenerate: node -e "const b=require('bcryptjs');console.log(b.hashSync('changeme',10))"

INSERT OR IGNORE INTO psa_definitions (id, name, description, min_rank) VALUES
  ('psa-01','Ace Pilot','Once per game, re-roll any one to-hit roll.',1),
  ('psa-02','Weapon Specialist','Receive +1 damage with one chosen weapon type.',1),
  ('psa-03','Maneuvering Ace','Add +1 to TMM once per turn.',1),
  ('psa-04','Lucky','Once per game, ignore one critical hit result.',1),
  ('psa-05','Jumping Jack','No +1 to-hit penalty when jumping.',1),
  ('psa-06','Speed Demon','Unit moves as if Move is 2 higher for TMM purposes.',1),
  ('psa-07','Sharpshooter','Ignore range penalty when firing at long range.',2),
  ('psa-08','Brawler','+1 damage to all physical/melee attacks.',2),
  ('psa-09','Tactical Genius','Once per game, activate out of initiative order.',2),
  ('psa-10','Iron Will','Ignore first critical effect when structure is breached.',2),
  ('psa-11','Scout','Spot for indirect fire without a to-hit penalty.',2),
  ('psa-12','Suppressive Fire','Once per turn, force a morale check or fall back.',2),
  ('psa-13','Marksman','Add +1 damage on a called shot once per game.',3),
  ('psa-14','Juggernaut','Ignore difficult terrain movement penalties.',3),
  ('psa-15','Combat Intuition','Never surprised; always acts first in initiative ties.',3),
  ('psa-16','Natural Aptitude (Gunnery)','Reduce gunnery skill by 1 (min 1) for ranged attacks.',3),
  ('psa-17','Natural Aptitude (Piloting)','Reduce piloting skill by 1 (min 1) for movement checks.',3),
  ('psa-18','Elite Pilot','Re-roll one die of any type once per game.',4),
  ('psa-19','Legendary','Friendly units within 6 inches gain +1 morale.',4),
  ('psa-20','Death from Above','Perform a DFA attack once per game without prerequisites.',4);

-- Default GM: username=gm password=changeme
-- Hash generated with bcryptjs rounds=10
INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES
  ('00000000-0000-0000-0000-000000000001',
   'gm',
   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
   'gm');
