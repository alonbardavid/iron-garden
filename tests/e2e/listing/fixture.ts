import { newEntityId } from "@lib/db-models/entity-ids";
import { TEST_USER } from "../users";

// More repositories than a page holds, named to sort after every other
// fixture so they never push one off a first page. The test user is a
// member of the first MEMBER_OF of them.
export const LISTING_FIXTURE = {
  prefix: "zz-paged",
  repositories: 23,
  memberOf: 3,
};

export const pagedRepository = (n: number) =>
  `${LISTING_FIXTURE.prefix}-${String(n).padStart(2, "0")}`;

export function buildListingFixtureSql(): string {
  const f = LISTING_FIXTURE;
  return Array.from({ length: f.repositories }, (_, i) => {
    const id = newEntityId("REPOSITORY");
    const insert = `INSERT INTO repositories (id, name, artifacts_name) VALUES ('${id}', '${pagedRepository(i + 1)}', '${id}');`;
    return i < f.memberOf
      ? `${insert}\nINSERT INTO repository_members (repository_id, user_id, level) SELECT '${id}', id, 'write' FROM user WHERE username = '${TEST_USER.username}';`
      : insert;
  }).join("\n");
}
