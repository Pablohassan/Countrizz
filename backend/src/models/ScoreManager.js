const AbstractManager = require("./AbstractManager");

class ScoreManager extends AbstractManager {
  static table = "table_des_scores";

  insert(score) {
    return this.connection.query(
      `insert into ${ScoreManager.table} (title) values (?)`,
      [score.title]
    );
  }

  update(score) {
    return this.connection.query(
      `update ${ScoreManager.table} set title = ? where id = ?`,
      [score.title, score.id]
    );
  }
}

module.exports = ScoreManager;
