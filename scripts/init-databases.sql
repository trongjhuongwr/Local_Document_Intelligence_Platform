SELECT 'CREATE DATABASE docintel_product OWNER docintel'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'docintel_product')\gexec
SELECT 'CREATE DATABASE docintel_test OWNER docintel'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'docintel_test')\gexec
SELECT 'CREATE DATABASE docintel_eval OWNER docintel'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'docintel_eval')\gexec

\connect docintel_product
CREATE EXTENSION IF NOT EXISTS vector;
\connect docintel_test
CREATE EXTENSION IF NOT EXISTS vector;
\connect docintel_eval
CREATE EXTENSION IF NOT EXISTS vector;
