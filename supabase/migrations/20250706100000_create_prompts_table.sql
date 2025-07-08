
CREATE TABLE prompts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    content text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prompts_pkey PRIMARY KEY (id)
);

ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow admins full access" ON prompts
    FOR ALL
    USING (is_admin(auth.uid()))
    WITH CHECK (is_admin(auth.uid()));

-- Function to ensure only one prompt is active
CREATE OR REPLACE FUNCTION only_one_active_prompt()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active THEN
        UPDATE prompts
        SET is_active = false
        WHERE id != NEW.id AND is_active = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce the single active prompt rule
CREATE TRIGGER trigger_only_one_active_prompt
BEFORE UPDATE OR INSERT ON prompts
FOR EACH ROW
EXECUTE FUNCTION only_one_active_prompt();

-- Create a unique index to prevent multiple active prompts (additional safeguard)
CREATE UNIQUE INDEX only_one_active_prompt_idx ON prompts (is_active)
WHERE (is_active = true);
