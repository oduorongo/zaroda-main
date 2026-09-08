-- ============================================================
-- Africa's Talking Delivery Reports (DLR): the "Sent" response from the send
-- API only means we handed the message to the telco — the real "did it reach
-- the phone?" answer arrives later as an async POST to a callback URL we
-- register on the AT dashboard (SMS -> Delivery Reports). This table is where
-- that callback's payload lands.
--
-- 005_communication_schema.sql already created a table with this name (part of
-- an original schema design that was never wired up to a real endpoint), so this
-- migration ALTERs it up to what the DLR webhook needs rather than re-creating it
-- — a plain CREATE TABLE IF NOT EXISTS here would silently no-op against it.
-- ============================================================
ALTER TABLE sms_delivery_reports ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE sms_delivery_reports ADD COLUMN IF NOT EXISTS network_code VARCHAR(20);
ALTER TABLE sms_delivery_reports ADD COLUMN IF NOT EXISTS raw_payload JSONB;

CREATE INDEX IF NOT EXISTS idx_sms_dlr_message_id ON sms_delivery_reports(message_id);
CREATE INDEX IF NOT EXISTS idx_sms_dlr_phone ON sms_delivery_reports(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_dlr_received ON sms_delivery_reports(received_at DESC);
