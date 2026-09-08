-- ============================================================
-- Africa's Talking Delivery Reports (DLR): the "Sent" response from the send
-- API only means we handed the message to the telco — the real "did it reach
-- the phone?" answer arrives later as an async POST to a callback URL we
-- register on the AT dashboard (SMS -> Delivery Reports). This table is where
-- that callback's payload lands.
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_delivery_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id VARCHAR(100),
  phone_number VARCHAR(20),
  status VARCHAR(30),
  network_code VARCHAR(20),
  failure_reason VARCHAR(100),
  retry_count INT,
  raw_payload JSONB,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_dlr_message_id ON sms_delivery_reports(message_id);
CREATE INDEX IF NOT EXISTS idx_sms_dlr_phone ON sms_delivery_reports(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_dlr_received ON sms_delivery_reports(received_at DESC);
