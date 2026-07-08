/**
 * 答案持久化存储
 * 将试错找到的正确答案保存到 ~/.hermes/answers.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class AnswerStore {
  constructor(config) {
    this.dir = path.join(os.homedir(), '.hermes');
    this.file = path.join(this.dir, 'answers.json');
    this.data = { allAnswers: {} };
    this.load();
  }

  load() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const raw = fs.readFileSync(this.file, 'utf8');
      this.data = JSON.parse(raw);
      console.log(`[AnswerStore] 已加载 ${Object.keys(this.data.allAnswers).length} 条答案`);
    } catch (e) {
      this.data = { allAnswers: {} };
    }
  }

  save() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.log(`[AnswerStore] 保存失败: ${e.message}`);
    }
  }

  getRight(questionText) {
    return this.data.allAnswers[questionText] || null;
  }

  saveRight(questionText, answer) {
    this.data.allAnswers[questionText] = answer;
    this.save();
  }

  getAll() {
    return this.data.allAnswers;
  }

  getCount() {
    return Object.keys(this.data.allAnswers).length;
  }
}

module.exports = AnswerStore;
