const AbstractManager = require("./AbstractManager");

class ScoreManager extends AbstractManager {
  static table = "score";

  insert(name, score) {
    return this.connection.query(
      `insert into ${ScoreManager.table} (name, score) values (?, ?)`,
      [name, score]
    );
  }

  update(score) {
    return this.connection.query(
      `update ${ScoreManager.table} set name = ?, score = ? where id = ?`,
      [score.name, score.score, score.id]
    );
  }
}

module.exports = ScoreManager;
