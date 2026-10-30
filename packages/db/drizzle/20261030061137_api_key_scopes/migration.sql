-- CREA-6: API-key permissions move from read/write/delete/admin to the
-- resource:action scope catalog (packages/domain/src/scopes.ts). Each stored
-- permission expands to the scopes it already reached (LEGACY_PERMISSION_SCOPES;
-- `admin` implied everything, so it expands to every scope); values that are
-- already catalog scopes are kept, anything else is dropped. Data only: no
-- table rebuild, and running it twice changes nothing.
WITH `catalog`(`scope`, `position`) AS (
  VALUES
    ('posts:write', 1),
    ('posts:delete', 2),
    ('workspace:read', 3),
    ('workspace:invite', 4),
    ('workspace:join', 5),
    ('billing:read', 6),
    ('preferences:read', 7),
    ('preferences:write', 8),
    ('profile:read', 9),
    ('api_keys:read', 10),
    ('api_keys:manage', 11),
    ('platform:admin', 12)
),
`legacy`(`permission`, `scope`) AS (
  VALUES
    ('read', 'workspace:read'),
    ('read', 'billing:read'),
    ('read', 'preferences:read'),
    ('read', 'profile:read'),
    ('read', 'api_keys:read'),
    ('write', 'posts:write'),
    ('write', 'preferences:write'),
    ('write', 'workspace:invite'),
    ('write', 'workspace:join'),
    ('delete', 'posts:delete')
)
UPDATE `api_keys` SET `permissions` = (
  SELECT json_group_array(`ordered`.`scope`) FROM (
    SELECT `c`.`scope` FROM `catalog` `c`
    WHERE `c`.`scope` IN (
      SELECT `l`.`scope` FROM json_each(`api_keys`.`permissions`) `p`
        JOIN `legacy` `l` ON `l`.`permission` = `p`.`value`
      UNION
      SELECT `p`.`value` FROM json_each(`api_keys`.`permissions`) `p`
    )
    OR EXISTS (
      SELECT 1 FROM json_each(`api_keys`.`permissions`) `p`
      WHERE `p`.`value` = 'admin'
    )
    ORDER BY `c`.`position`
  ) `ordered`
);
