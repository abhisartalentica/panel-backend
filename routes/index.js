var express = require("express");
var router = express.Router();
const util = require("./util");
const { pool } = require("../config");
const mail = require("./mail");

router.get("/", function(req, res, next) {
  res.render("index", { title: "firebase" });
});
router.get("/users", function(req, res, next) {
  util.getAll("users").then(i => res.status(200).json(i));
});

router.get("/roles", function(req, res, next) {
  util.getAll("roles").then(i => res.status(200).json(i));
});

router.get("/skills", function(req, res, next) {
  util.getAll("skills").then(i => res.status(200).json(i));
});

router.post("/surveys", function(req, res, next) {
  pool.query(
    `SELECT * FROM surveys WHERE id = ${req.body.id}`,
    (error, result) => {
      if (error) {
        throw error;
      }
      res.status(200).json(
        result.rows.map(i => ({
          ...i,
          dates_array: JSON.parse(i.dates_array),
        }))
      );
    }
  );
});

router.get("/get_all_surveys", function(req, res, next) {
  pool.query(
    `SELECT * FROM surveys ORDER BY created_on DESC LIMIT 50;`,
    (error, result) => {
      if (error) {
        throw error;
      }
      res.status(200).json(
        result.rows.map(i => ({
          ...i,
          dates_array: JSON.parse(i.dates_array),
        }))
      );
    }
  );
});

router.get("/responses", function(req, res, next) {
  util.getAll("responses").then(i => res.status(200).json(i));
});

router.post("/validate", function(req, res, next) {
  $query = `SELECT password FROM users WHERE (email = '${req.body.email}');`;
  pool.query($query, (error, result) => {
    if (error) {
      throw error;
    }
    res.status(200).json({
      status:
        result.rows.length && result.rows[0].password === req.body.password,
    });
  });
});

router.get("/get_panel_members", function(req, res, next) {
  util.panelMembers().then(i => res.status(200).json(i));
});

router.post("/add_modify_panel", function(req, res, next) {
  $query = `SELECT * FROM users WHERE (email = '${req.body.email}')`;
  pool.query($query, (error, result) => {
    if (error) {
      throw error;
    }
    if (result.rows.length === 1) {
      $update_query = `UPDATE users SET skill_set_ids = '${req.body.skill_set_ids.join(
        ","
      )}' WHERE (email = '${req.body.email}')`;
      pool.query($update_query, (error, result) => {
        if (error) {
          throw error;
        }
        res.status(200).json("User skills have been updated successfully.");
      });
    } else {
      $query = `INSERT INTO users (name,email,password,role_id,skill_set_ids) VALUES ('${
        req.body.email
          .split(".")
          .join(" ")
          .split("@")[0]
      }','${req.body.email}','test',1,'${req.body.skill_set_ids.join(",")}')`;
      pool.query($query, (error, result) => {
        if (error) {
          throw error;
        }
        res.status(200).json("User added successfully.");
      });
    }
  });
});

router.post("/remove_panel", function(req, res, next) {
  $query = `DELETE FROM users WHERE (email = '${req.body.email}' AND role_id = 1)`;
  pool.query($query, (error, result) => {
    if (error) {
      throw error;
    }
    res.status(200).json("Panel Removed Successfully");
  });
});

router.get("/truncate", function(req, res, next) {
  $query = `truncate table surveys;truncate table responses;`;
  pool.query($query, (error, result) => {
    if (error) {
      throw error;
    }
    res.status(200).json("Done Successfully");
  });
});

router.post("/create_survey", function(req, res, next) {
  pool.query("SELECT dates_array FROM surveys;", (error, latest) => {
    let allDates = latest.rows.reduce((acc,item) => {JSON.parse(item.dates_array).map(i => acc[i] = true);return acc;}, {});
    if(req.body.dates_array.some(item => allDates[item])){
      res.status(200).json({status: "Error",message:`Conflicting dates exist for -> [${req.body.dates_array.filter(item => allDates[item]).join(",")}]!!`});
    }else {
      pool.query("SELECT email FROM users WHERE role_id = 1", (error, result) => {
        if (error) {
          throw error;
        }
        $panel = result.rows.map(i => i.email);
        $qq = `INSERT INTO surveys (name,date,dates_array,recepients,responders,in_queue, created_on) VALUES ('${
          req.body.name
        }','${req.body.date}','${JSON.stringify(
          req.body.dates_array
        )}','${$panel.join(",")}','','${$panel.join(",")}', current_timestamp)`;
        pool.query($qq, (error, result) => {
          if (error) {
            throw error;
          }
          $last_record_query =
            `SELECT id,created_on FROM surveys WHERE name = '${req.body.name}';`;
          pool.query($last_record_query, (error, result) => {
            if (error) {
              throw error;
            }
            if (result.rows.length) {
              $id = result.rows[0].id;
              $start_date = result.rows[0].creates_on;
              
              $panel.map(i => {
                mail.sendMailViaSendgrid(i,$id)
                // mail.sendMailViaMailgun(i,$id)
              });
            }
          });

          res.status(200).json({status: "Success",message:"Created Survey Successfully."});
        });
      });
    }
  });
});

router.post("/respond", function(req, res, next) {
  $survey_details = [];
  console.log(req.body)
  req.body.comments = req.body.comments || null;
  req.body.outstation = req.body.outstation || false;
  $user_id = null;
  $query = `SELECT id FROM users WHERE (email = '${req.body.email}')`;
  pool.query($query, (error, result) => {
    if (error) {
      throw error;
    }
    if (result.rows.length > 0) {
      $user_id = result.rows[0].id;
      $query = `INSERT INTO responses (batch_id,date_response,user_id, comments, outstation) VALUES (${
        req.body.survey_id
      }, '${JSON.stringify(req.body.dates_array)}', ${$user_id}, '${
        req.body.comments
      }', '${req.body.outstation}') ON CONFLICT (user_id, batch_id) DO UPDATE 
      SET date_response = '${JSON.stringify(
        req.body.dates_array
      )}',comments = '${req.body.comments}', outstation = ${
        req.body.outstation
      };`;
      pool.query($query, (error, result) => {
        if (error) {
          throw error;
        }
        $qq = `SELECT * FROM surveys WHERE  id = ${req.body.survey_id}`;
        pool.query($qq, (error, result) => {
          if (error) {
            throw error;
          }
          $survey_details = result.rows && result.rows[0];
          if ($survey_details) {
            $survey_details.responders = $survey_details.responders || "";
            $survey_details.in_queue = $survey_details.in_queue || "";
            $responders = $survey_details.responders
              .split(",")
              .some(i => i === req.body.email)
              ? $survey_details.responders
              : $survey_details.responders
                  .split(",")
                  .concat([req.body.email])
                  .join(",");
            $in_queue = !$survey_details.in_queue
              .split(",")
              .some(i => i === req.body.email)
              ? $survey_details.in_queue
              : $survey_details.in_queue
                  .split(",")
                  .filter(i => i !== req.body.email)
                  .join(",");
            $update_query = `UPDATE surveys SET responders = '${$responders}',in_queue = '${$in_queue}' WHERE id = ${req.body.survey_id}`;
            pool.query($update_query, (error, result) => {
              if (error) {
                throw error;
              }
              $survey_details = result.rows;
              res.status(200).json("Response Recorded Successfully.");
            });
          }
        });
      });
    } else {
      res.status(200).json("Invalid User.");
    }
  });
});

router.post("/send_reminder_mails", function(req, res, next) {
  pool.query(
    `SELECT in_queue FROM surveys WHERE id = ${req.body.survey_id}`,
    (error, result) => {
      if (error) {
        throw error;
      }
      console.log(result.rows);
      if (result.rows.length) {
        $panels = result.rows[0].in_queue.split(",");
        $panels.map(i => {
          mail.sendMailViaSendgrid(i,req.body.survey_id)
        });
      }
      res.status(200).json(result.rows);
    }
  );
});

router.get("/get_all_responses", async function(req, res) {
  let panel = await util.panelMembers();
  $query = `SELECT surveys.id, surveys.name as survey_name, surveys.dates_array as super_set ,responses.user_id, responses.date_response as availability, responses.comments, responses.outstation, responses.created_on, users.name, responses.attendence FROM surveys LEFT JOIN responses ON surveys.id = responses.batch_id LEFT JOIN users on responses.user_id = users.id ORDER BY responses.created_on;`;
  pool.query($query, (error, result) => {
    if (error) {
      throw error;
    }
    console.log("#$%attendence", result.rows);
    let superSet = {};
    result.rows.map(i => {
      JSON.parse(i.super_set).map(a => (superSet[a] = 1));
    });
    let data = result.rows.reduce((acc, i, idx) => {
      i.availability = JSON.parse(i.availability);
      i.super_set = JSON.parse(i.super_set);
      
      if (acc[i.user_id]) {
        acc[i.user_id].availability = acc[i.user_id].availability || [];
        acc[i.user_id].availability.concat(i.availability || []);
        Object.keys(superSet).map(date => {
          if(acc[i.user_id][date] === "No"){
            acc[i.user_id][date] = Array.isArray(i.availability) && i.availability.includes(date)
            ? "Yes"
            : "No";
          }
        })
      } else {
        const skills = panel.find(item => item.user_id === i.user_id);
        acc[i.user_id] = {
          user_id: i.user_id,
          name: i.name,
          comments: i.comments,
          attendence: JSON.parse(i.attendence),
          batch_id: i.id,
          // survey_name: i.survey_name,
          outstation: i.outstation ? "Yes" : "No",
          skills: (skills && skills.skill_name) || [],
          ...Object.keys(superSet)
            .sort()
            .reduce((a, date) => {
              a[date] =
                Array.isArray(i.availability) && i.availability.includes(date)
                  ? "Yes"
                  : "No";
              return a;
            }, {}),
        };
      }
      
      return acc;
    }, {});
    res.status(200).json(Object.values(data));
  });
});

router.post("/submit_attendence", async function(req, res, next) {
  let batch_ids = req.body.much
    .reduce((str, i) => {
      str += `,${i.batch_id}`;
      return str;
    }, "")
    .replace(/(^,)|(,$)/g, "");
  let user_ids = req.body.much
    .reduce((str, i) => {
      str += `,${i.user_id}`;
      return str;
    }, "")
    .replace(/(^,)|(,$)/g, "");
  const info = await pool.query(
    `SELECT * FROM responses WHERE batch_id in (${batch_ids}) AND user_id in (${user_ids});`
  );

  req.body.much.map(async i => {
    const row = info.rows.find(j => i.batch_id == j.batch_id && i.user_id == j.user_id) || {};
    const attendence = (row.attendence && JSON.parse(row.attendence)) || {};
    Object.keys(i.attendence).map(
      item => (attendence[item] = i.attendence[item])
    );
    console.log("ATTANDENCE!!!", info.rows, row, i)
    await pool.query(
      `UPDATE responses SET attendence = '${JSON.stringify(
        attendence
      )}' WHERE (batch_id = ${i.batch_id} AND user_id = ${i.user_id});`
    );
    return i;
  });
  return res.status(200).json("Success");
});

router.get("/get_data_in_preorder_form", async function(req, res, next) {
  const data = [
    {inorder_index: 30, name: "Gwynne Shotwell", designation: "CEO"}
    ,{inorder_index: 20, name: "Tim Hughes", designation: "CFO"}
    ,{inorder_index: 15, name: "Gwynne Shotwell", designation: "Manager"}
    ,{inorder_index: 17, name: "Bret Johnsen", designation: "SSD"}
    ,{inorder_index: 25, name: "Joy Dunn", designation: "Manager"}
    ,{inorder_index: 40, name: "Andy Lambert", designation: "CTO"}
    ,{inorder_index: 35, name: "Umer Khan", designation: "Manager"}
    ,{inorder_index: 50, name: "Hans Koenigsmann", designation: "Manager"}
    ,{inorder_index: 45, name: "Mark Ruff", designation: "SSD"}
];
  return res.status(200).json(data);
});

module.exports = router;
