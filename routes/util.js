const { pool } = require("../config");
module.exports = {
  panelMembers: () =>
    new Promise((res, rej) =>
      pool.query(
        `SELECT t1.id as user_id, t1.email as email, t1.name as name, t2.name as skill_name FROM users as t1 LEFT JOIN skills as t2 ON t2.id = any(string_to_array(t1.skill_set_ids,',')::int[])`,
        (error, result) => {
          if (error) {
            throw error;
          }
          res(
            Object.values(
              result.rows.reduce((acc, i) => {
                if (acc[i.user_id]) {
                  acc[i.user_id].skill_name.push(i.skill_name);
                } else {
                  acc[i.user_id] = i;
                  acc[i.user_id].skill_name = [acc[i.user_id].skill_name];
                }
                return acc;
              }, {})
            )
          );
        }
      )
    ),
    getAll: (table) => new Promise((res, rej) =>
    pool.query(
      `SELECT * FROM ${table};`,
      (error, result) => {
        if (error) {
          throw error;
        }
        res(
          result.rows
        );
      }
    )
  )
};
