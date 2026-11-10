-- Default Seed Data for Recipients
-- Pre-configures the 2 primary recipient slots required by the application

INSERT INTO recipients (id, name, email, phone, whatsapp)
VALUES 
    (1, 'Ravi Sehrawat (Primary)', 'ravi123sehravat@gmail.com', '+919876543210', '+919876543210'),
    (2, 'Operations Lead (Secondary)', 'operations@example.com', '+919876543211', '+919876543211')
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    email = excluded.email,
    phone = excluded.phone,
    whatsapp = excluded.whatsapp,
    updated_at = CURRENT_TIMESTAMP;
