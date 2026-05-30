ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'aguardando_emissao';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'pronto_para_envio';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'a_fazer';