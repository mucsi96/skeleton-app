CREATE TABLE IF NOT EXISTS greetings (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    message TEXT NOT NULL
);

INSERT INTO greetings (name, message)
SELECT 'World', 'Welcome to the skeleton app!'
WHERE NOT EXISTS (SELECT 1 FROM greetings);
