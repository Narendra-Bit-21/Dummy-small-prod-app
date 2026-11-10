-- Default Seed Data for Recipients
-- Pre-configures the 2 primary recipient slots required by the application

INSERT INTO recipients (id, name, email, phone, whatsapp)
VALUES 
    (1, 'Pratishtha', 'pratishthavsingh123@gmail.com', '+917355062427', '+917355062427'),
    (2, 'Ravi', 'kajupretty2202@gmail.com', '+918769030475', '+918769030475')
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    email = excluded.email,
    phone = excluded.phone,
    whatsapp = excluded.whatsapp,
    updated_at = CURRENT_TIMESTAMP;
