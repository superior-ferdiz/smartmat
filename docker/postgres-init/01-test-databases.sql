-- Separate databases for automated tests, so tests never touch development data.
--   smartmat_test: API tests (Vitest)
--   smartmat_e2e:  Playwright
CREATE DATABASE smartmat_test OWNER smartmat;
CREATE DATABASE smartmat_e2e OWNER smartmat;
