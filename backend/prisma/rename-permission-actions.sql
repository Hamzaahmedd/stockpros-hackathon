-- Rename persisted RBAC actions without changing the Permission schema.
-- Run once against the existing database before deploying the renamed application.

BEGIN;

DO $$
DECLARE
	old_permission RECORD;
	replacement_id UUID;
BEGIN
	FOR old_permission IN
		SELECT id, action, resource_id,
					 CASE action
						 WHEN 'create' THEN 'write'
						 WHEN 'update' THEN 'edit'
					 END AS replacement_action
		FROM permissions
		WHERE action IN ('create', 'update')
	LOOP
		SELECT id INTO replacement_id
		FROM permissions
		WHERE resource_id = old_permission.resource_id
			AND action = old_permission.replacement_action;

		IF replacement_id IS NULL THEN
			UPDATE permissions
			SET action = old_permission.replacement_action
			WHERE id = old_permission.id;
		ELSE
			DELETE FROM role_permissions old_links
			WHERE old_links.permission_id = old_permission.id
				AND EXISTS (
					SELECT 1 FROM role_permissions replacement_links
					WHERE replacement_links.role_id = old_links.role_id
						AND replacement_links.permission_id = replacement_id
				);

			UPDATE role_permissions
			SET permission_id = replacement_id
			WHERE permission_id = old_permission.id;

			DELETE FROM user_permissions old_links
			WHERE old_links.permission_id = old_permission.id
				AND EXISTS (
					SELECT 1 FROM user_permissions replacement_links
					WHERE replacement_links.user_id = old_links.user_id
						AND replacement_links.permission_id = replacement_id
				);

			UPDATE user_permissions
			SET permission_id = replacement_id
			WHERE permission_id = old_permission.id;

			DELETE FROM permissions WHERE id = old_permission.id;
		END IF;
	END LOOP;
END $$;

DROP TABLE IF EXISTS screens;

COMMIT;
