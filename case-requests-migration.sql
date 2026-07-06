-- MDconcierge: in-portal provider↔attorney request form
-- Paste this entire block into Supabase SQL editor and run.

-- 1. Table
CREATE TABLE IF NOT EXISTS case_requests (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id      bigint      REFERENCES cases(id) ON DELETE CASCADE NOT NULL,
  from_role    text        NOT NULL CHECK (from_role IN ('provider', 'attorney')),
  request_type text        NOT NULL,
  message      text        NOT NULL DEFAULT '',
  status       text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered')),
  notified_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE case_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_case_requests" ON case_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Provider submits a request (token = cases.accept_token)
CREATE OR REPLACE FUNCTION submit_request_provider(
  p_token   text,
  p_type    text,
  p_message text DEFAULT ''
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_case cases%ROWTYPE;
BEGIN
  SELECT * INTO v_case FROM cases
  WHERE accept_token = p_token
    AND (accept_token_exp IS NULL OR accept_token_exp > now());
  IF NOT FOUND THEN RETURN '{"ok":false,"error":"invalid token"}'::json; END IF;
  INSERT INTO case_requests(case_id, from_role, request_type, message)
    VALUES (v_case.id, 'provider', p_type, COALESCE(p_message,''));
  INSERT INTO audit_log(case_id, action, detail, source)
    VALUES (v_case.id, 'request_submitted', 'type:'||p_type||' from:provider', 'provider');
  RETURN '{"ok":true}'::json;
END;$$;
GRANT EXECUTE ON FUNCTION submit_request_provider(text,text,text) TO anon;

-- 3. Attorney submits a request (token = cases.status_token)
CREATE OR REPLACE FUNCTION submit_request_attorney(
  p_token   text,
  p_type    text,
  p_message text DEFAULT ''
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_case cases%ROWTYPE;
BEGIN
  SELECT * INTO v_case FROM cases
  WHERE status_token = p_token
    AND (status_token_exp IS NULL OR status_token_exp > now());
  IF NOT FOUND THEN RETURN '{"ok":false,"error":"invalid token"}'::json; END IF;
  INSERT INTO case_requests(case_id, from_role, request_type, message)
    VALUES (v_case.id, 'attorney', p_type, COALESCE(p_message,''));
  INSERT INTO audit_log(case_id, action, detail, source)
    VALUES (v_case.id, 'request_submitted', 'type:'||p_type||' from:attorney', 'attorney');
  RETURN '{"ok":true}'::json;
END;$$;
GRANT EXECUTE ON FUNCTION submit_request_attorney(text,text,text) TO anon;

-- 4. Get all requests for a case (provider via accept_token)
CREATE OR REPLACE FUNCTION get_case_requests_provider(p_token text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_case cases%ROWTYPE; v_reqs json;
BEGIN
  SELECT * INTO v_case FROM cases
  WHERE accept_token = p_token
    AND (accept_token_exp IS NULL OR accept_token_exp > now());
  IF NOT FOUND THEN RETURN '{"ok":false}'::json; END IF;
  SELECT json_agg(row_to_json(r) ORDER BY r.created_at DESC) INTO v_reqs
  FROM case_requests r WHERE r.case_id = v_case.id;
  RETURN json_build_object('ok', true, 'requests', COALESCE(v_reqs, '[]'::json));
END;$$;
GRANT EXECUTE ON FUNCTION get_case_requests_provider(text) TO anon;

-- 5. Get all requests for a case (attorney via status_token)
CREATE OR REPLACE FUNCTION get_case_requests_attorney(p_token text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_case cases%ROWTYPE; v_reqs json;
BEGIN
  SELECT * INTO v_case FROM cases
  WHERE status_token = p_token
    AND (status_token_exp IS NULL OR status_token_exp > now());
  IF NOT FOUND THEN RETURN '{"ok":false}'::json; END IF;
  SELECT json_agg(row_to_json(r) ORDER BY r.created_at DESC) INTO v_reqs
  FROM case_requests r WHERE r.case_id = v_case.id;
  RETURN json_build_object('ok', true, 'requests', COALESCE(v_reqs, '[]'::json));
END;$$;
GRANT EXECUTE ON FUNCTION get_case_requests_attorney(text) TO anon;
