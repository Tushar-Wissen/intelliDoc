-- Workaround for Epic 0 DESIGN GAP: no signup/provisioning API exists.
-- Password for jane.doe@company.com is: password
-- Hash is bcrypt for "password" (Laravel well-known fixture hash).
-- Apply after Flyway has created tenant and user_account:
--   psql -h localhost -U postgres -d intellidoc -f scripts/seed_users.sql

INSERT INTO tenant (id, name, created_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'IntelliDoc POC Tenant',
    NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_account (
    id,
    tenant_id,
    email,
    display_name,
    role,
    password_hash,
    created_at
)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'jane.doe@company.com',
    'Jane Doe',
    'member',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    NOW()
)
ON CONFLICT (email) DO NOTHING;
