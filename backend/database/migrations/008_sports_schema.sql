-- ============================================================
-- ZARODA SPORTS MANAGEMENT SYSTEM — TWO-TIER ARCHITECTURE
-- MODULE 07: Sports Schema (complete rebuild)
-- TIER 1: School-level (inside SMS per school)
-- TIER 2: ZARODA Sports Base (cross-school, FREE separate system — API connected)
-- ============================================================

-- Disciplines (shared reference, no tenant)
CREATE TABLE sports_disciplines (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  category      VARCHAR(20)  NOT NULL CHECK (category IN ('team','individual','athletics','aquatics','combat','racket','other')),
  gender        VARCHAR(10)  NOT NULL DEFAULT 'mixed' CHECK (gender IN ('male','female','mixed')),
  min_players   SMALLINT DEFAULT 1,
  max_players   SMALLINT DEFAULT 15,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, gender)
);

-- TIER 1 ---------------------------------------------------------

CREATE TABLE school_teams (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  discipline_id   UUID NOT NULL REFERENCES sports_disciplines(id),
  name            VARCHAR(150) NOT NULL,
  team_type       VARCHAR(20)  NOT NULL DEFAULT 'school'
                  CHECK (team_type IN ('school','class','house')),
  gender          VARCHAR(10)  NOT NULL CHECK (gender IN ('male','female','mixed')),
  age_group       VARCHAR(20),
  academic_year   VARCHAR(9),
  coach_id        UUID REFERENCES users(id),
  captain_id      UUID REFERENCES learners(id),
  jersey_color    VARCHAR(50),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE school_team_members (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  team_id       UUID NOT NULL REFERENCES school_teams(id) ON DELETE CASCADE,
  learner_id    UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  jersey_number VARCHAR(5),
  position      VARCHAR(50),
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','injured','suspended','inactive')),
  joined_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, learner_id)
);

CREATE TABLE athlete_profiles (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id              UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  height_cm               NUMERIC(5,1),
  weight_kg               NUMERIC(5,1),
  jersey_number           VARCHAR(5),
  dominant_hand           VARCHAR(10) CHECK (dominant_hand IN ('right','left','both')),
  primary_discipline_id   UUID REFERENCES sports_disciplines(id),
  secondary_discipline_id UUID REFERENCES sports_disciplines(id),
  talent_score            NUMERIC(4,1),
  talent_notes            TEXT,
  personal_bests          JSONB DEFAULT '{}',
  awards                  JSONB DEFAULT '[]',
  is_active               BOOLEAN NOT NULL DEFAULT true,
  medical_notes           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, learner_id)
);

CREATE TABLE internal_competitions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  competition_type VARCHAR(20) NOT NULL DEFAULT 'inter_class'
                  CHECK (competition_type IN ('inter_class','inter_house','practice')),
  discipline_id   UUID NOT NULL REFERENCES sports_disciplines(id),
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  start_date      DATE,
  end_date        DATE,
  format          VARCHAR(20) NOT NULL DEFAULT 'round_robin'
                  CHECK (format IN ('round_robin','knockout','mixed','league')),
  status          VARCHAR(20) NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned','ongoing','completed')),
  winner_name     VARCHAR(150),
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE internal_fixtures (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  competition_id  UUID REFERENCES internal_competitions(id),
  discipline_id   UUID NOT NULL REFERENCES sports_disciplines(id),
  home_team_id    UUID REFERENCES school_teams(id),
  away_team_id    UUID REFERENCES school_teams(id),
  home_label      VARCHAR(100),
  away_label      VARCHAR(100),
  fixture_date    DATE,
  fixture_time    TIME,
  venue           VARCHAR(200),
  round           VARCHAR(50),
  status          VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','completed','postponed','cancelled')),
  home_score      NUMERIC(5,1),
  away_score      NUMERIC(5,1),
  notes           TEXT,
  recorded_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- QUALIFICATION REGISTER: School nominates qualified teams/athletes for Base
CREATE TABLE qualification_registers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year     VARCHAR(9)  NOT NULL,
  discipline_id     UUID NOT NULL REFERENCES sports_disciplines(id),
  competition_level VARCHAR(20) NOT NULL
                    CHECK (competition_level IN ('zone','sub_county','county','regional','national','international')),
  team_id           UUID REFERENCES school_teams(id),
  name              VARCHAR(255) NOT NULL,
  qualified_via     VARCHAR(100),
  qualification_date DATE,
  notes             TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'qualified'
                    CHECK (status IN ('qualified','submitted','registered','competing','eliminated','champions')),
  base_championship_id UUID,
  pushed_at         TIMESTAMPTZ,
  pushed_by         UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE qualified_athletes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  qualification_id UUID NOT NULL REFERENCES qualification_registers(id) ON DELETE CASCADE,
  learner_id       UUID NOT NULL REFERENCES learners(id),
  events           TEXT[],
  personal_best    VARCHAR(50),
  seed_position    SMALLINT,
  base_bib_number  VARCHAR(10),
  base_athlete_id  UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(qualification_id, learner_id)
);

CREATE TABLE talent_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL,
  discipline_id   UUID REFERENCES sports_disciplines(id),
  talent_score    NUMERIC(4,1),
  strengths       TEXT[],
  areas_to_improve TEXT[],
  recommendation  TEXT,
  ai_generated    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TIER 2 — ZARODA SPORTS BASE ------------------------------------

CREATE TABLE base_championships (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(255) NOT NULL,
  level             VARCHAR(20)  NOT NULL
                    CHECK (level IN ('zone','sub_county','county','regional','national','international')),
  competition_type  VARCHAR(20)  NOT NULL DEFAULT 'tournament'
                    CHECK (competition_type IN ('tournament','league','athletics_meet','relay','cup','friendly')),
  discipline_id     UUID REFERENCES sports_disciplines(id),
  host_school_name  VARCHAR(255),
  venue             VARCHAR(255),
  county            VARCHAR(100),
  start_date        DATE NOT NULL,
  end_date          DATE,
  academic_year     VARCHAR(9)  NOT NULL,
  gender            VARCHAR(10) CHECK (gender IN ('male','female','mixed','open')),
  age_group         VARCHAR(20),
  max_teams         SMALLINT,
  max_athletes      SMALLINT,
  registration_deadline DATE,
  -- No billing — ZARODA Sports Base is a FREE platform
  -- Schools connect and push qualified teams/athletes at no charge
  status            VARCHAR(20) NOT NULL DEFAULT 'upcoming'
                    CHECK (status IN ('upcoming','registration_open','registration_closed',
                                      'ongoing','completed','cancelled')),
  results_published BOOLEAN NOT NULL DEFAULT false,
  organiser_name    VARCHAR(255),
  organiser_contact VARCHAR(100),
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE base_championship_registrations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  championship_id   UUID NOT NULL REFERENCES base_championships(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  school_id         UUID NOT NULL REFERENCES schools(id),
  school_name       VARCHAR(255) NOT NULL,
  qualification_id  UUID REFERENCES qualification_registers(id),
  registered_by     UUID REFERENCES users(id),
  registered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  team_name         VARCHAR(150),
  status            VARCHAR(20) NOT NULL DEFAULT 'registered'
                    CHECK (status IN ('registered','confirmed','withdrawn','disqualified')),
  notes             TEXT,
  UNIQUE(championship_id, school_id)
);

CREATE TABLE base_athletes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  championship_id   UUID NOT NULL REFERENCES base_championships(id) ON DELETE CASCADE,
  registration_id   UUID NOT NULL REFERENCES base_championship_registrations(id),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  learner_id        UUID NOT NULL REFERENCES learners(id),
  school_name       VARCHAR(255) NOT NULL,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  gender            VARCHAR(10),
  date_of_birth     DATE,
  grade_level       VARCHAR(20),
  events            TEXT[],
  personal_best     VARCHAR(50),
  seed_position     SMALLINT,
  bib_number        VARCHAR(10) UNIQUE,
  bib_assigned_at   TIMESTAMPTZ,
  status            VARCHAR(20) NOT NULL DEFAULT 'registered'
                    CHECK (status IN ('registered','confirmed','competing','dns','dnf','disqualified')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE base_fixtures (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  championship_id   UUID NOT NULL REFERENCES base_championships(id) ON DELETE CASCADE,
  discipline_id     UUID NOT NULL REFERENCES sports_disciplines(id),
  event_name        VARCHAR(100),
  fixture_type      VARCHAR(20) NOT NULL DEFAULT 'match'
                    CHECK (fixture_type IN ('match','heat','semi_final','final','relay',
                                            'field_event','quarter_final','pool_match')),
  home_reg_id       UUID REFERENCES base_championship_registrations(id),
  away_reg_id       UUID REFERENCES base_championship_registrations(id),
  home_school_name  VARCHAR(150),
  away_school_name  VARCHAR(150),
  fixture_date      DATE,
  fixture_time      TIME,
  venue             VARCHAR(200),
  round             VARCHAR(50),
  heat_number       SMALLINT,
  status            VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','ongoing','completed','postponed','cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE base_fixture_results (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fixture_id        UUID NOT NULL REFERENCES base_fixtures(id) ON DELETE CASCADE,
  home_score        NUMERIC(5,1),
  away_score        NUMERIC(5,1),
  is_draw           BOOLEAN DEFAULT false,
  winner_school_name VARCHAR(150),
  walkover          BOOLEAN DEFAULT false,
  half_time_score   VARCHAR(20),
  extra_time        BOOLEAN DEFAULT false,
  penalties         BOOLEAN DEFAULT false,
  scorecard         JSONB DEFAULT '{}',
  scorers           JSONB DEFAULT '[]',
  referee           VARCHAR(150),
  attendance        INTEGER,
  match_notes       TEXT,
  recorded_by       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(fixture_id)
);

CREATE TABLE base_athletics_results (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  championship_id           UUID NOT NULL REFERENCES base_championships(id) ON DELETE CASCADE,
  fixture_id                UUID REFERENCES base_fixtures(id),
  base_athlete_id           UUID NOT NULL REFERENCES base_athletes(id) ON DELETE CASCADE,
  event_name                VARCHAR(100) NOT NULL,
  heat_number               SMALLINT,
  result_value              NUMERIC(10,3),
  result_unit               VARCHAR(5),
  wind_speed                NUMERIC(4,1),
  position                  SMALLINT,
  is_personal_best          BOOLEAN DEFAULT false,
  is_championship_record    BOOLEAN DEFAULT false,
  is_national_record        BOOLEAN DEFAULT false,
  dns                       BOOLEAN DEFAULT false,
  dnf                       BOOLEAN DEFAULT false,
  dq                        BOOLEAN DEFAULT false,
  notes                     TEXT,
  recorded_by               UUID REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE base_standings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  championship_id   UUID NOT NULL REFERENCES base_championships(id) ON DELETE CASCADE,
  registration_id   UUID NOT NULL REFERENCES base_championship_registrations(id),
  school_name       VARCHAR(150),
  played            SMALLINT NOT NULL DEFAULT 0,
  won               SMALLINT NOT NULL DEFAULT 0,
  drawn             SMALLINT NOT NULL DEFAULT 0,
  lost              SMALLINT NOT NULL DEFAULT 0,
  goals_for         SMALLINT NOT NULL DEFAULT 0,
  goals_against     SMALLINT NOT NULL DEFAULT 0,
  goal_difference   SMALLINT GENERATED ALWAYS AS (goals_for - goals_against) STORED,
  points            SMALLINT GENERATED ALWAYS AS (won * 3 + drawn) STORED,
  position          SMALLINT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(championship_id, registration_id)
);

-- Indexes
CREATE INDEX idx_school_teams_tenant    ON school_teams(tenant_id, is_active);
CREATE INDEX idx_team_members_team      ON school_team_members(team_id);
CREATE INDEX idx_team_members_learner   ON school_team_members(learner_id);
CREATE INDEX idx_athlete_learner        ON athlete_profiles(learner_id);
CREATE INDEX idx_athlete_talent         ON athlete_profiles(tenant_id, talent_score DESC);
CREATE INDEX idx_internal_comps_tenant  ON internal_competitions(tenant_id, academic_year, term);
CREATE INDEX idx_internal_fixtures      ON internal_fixtures(competition_id);
CREATE INDEX idx_qual_reg_tenant        ON qualification_registers(tenant_id, academic_year);
CREATE INDEX idx_qual_reg_status        ON qualification_registers(status);
CREATE INDEX idx_qual_athletes          ON qualified_athletes(qualification_id);
CREATE INDEX idx_base_champ_level       ON base_championships(level, academic_year, status);
CREATE INDEX idx_base_regs_champ        ON base_championship_registrations(championship_id);
CREATE INDEX idx_base_regs_tenant       ON base_championship_registrations(tenant_id);
CREATE INDEX idx_base_athletes_champ    ON base_athletes(championship_id);
CREATE INDEX idx_base_athletes_bib      ON base_athletes(bib_number);
CREATE INDEX idx_base_fixtures_champ    ON base_fixtures(championship_id, status);
CREATE INDEX idx_base_athletics_champ   ON base_athletics_results(championship_id, event_name);
CREATE INDEX idx_base_standings         ON base_standings(championship_id);

-- RLS (Tier 1 only — tenant-scoped)
DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'school_teams','school_team_members','athlete_profiles',
    'internal_competitions','internal_fixtures',
    'qualification_registers','qualified_athletes','talent_reports'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'')::UUID)', tbl
    );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'school_teams','athlete_profiles','internal_competitions','internal_fixtures',
    'qualification_registers','base_championships','base_fixtures','base_standings'
  ]) LOOP
    BEGIN
      EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      replace(tbl,'-','_'), tbl
    );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

INSERT INTO sports_disciplines (name, category, gender, min_players, max_players) VALUES
('Football','team','male',11,18),('Football','team','female',11,18),
('Volleyball','team','male',6,12),('Volleyball','team','female',6,12),
('Basketball','team','mixed',5,12),('Handball','team','mixed',7,14),
('Netball','team','female',7,12),('Rugby','team','male',15,22),
('100m Sprint','athletics','mixed',1,1),('200m','athletics','mixed',1,1),
('400m','athletics','mixed',1,1),('800m','athletics','mixed',1,1),
('1500m','athletics','mixed',1,1),('4x100m Relay','athletics','mixed',4,4),
('4x400m Relay','athletics','mixed',4,4),('Long Jump','athletics','mixed',1,1),
('High Jump','athletics','mixed',1,1),('Triple Jump','athletics','mixed',1,1),
('Shot Put','athletics','mixed',1,1),('Discus','athletics','mixed',1,1),
('Javelin','athletics','mixed',1,1),('Table Tennis','racket','mixed',1,2),
('Badminton','racket','mixed',1,2),('Chess','other','mixed',1,1),
('Swimming','aquatics','mixed',1,1) ON CONFLICT DO NOTHING;
