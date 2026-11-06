#!/usr/bin/env node
/**
 * 可选题库结构检查。只输出计数与错误位置，不输出题目正文。
 * 运行时 Zod 仍是权威校验；此脚本用于部署前快速发现目录、ID、选项和图片路径问题。
 *
 * 用法：
 *   node scripts/check-local-data.mjs
 *   node scripts/check-local-data.mjs --require-data
 */
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const requireData = process.argv.includes('--require-data');
const errors = [];
const stats = { examFiles: 0, passages: 0, questions: 0, essayFiles: 0, essays: 0, reviewedEssays: 0 };

function fail(message) {
  errors.push(message);
}

async function jsonFiles(directory) {
  if (!existsSync(directory)) return [];
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readArray(file) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!Array.isArray(value)) {
      fail(`${path.relative(ROOT, file)}: 顶层必须是数组`);
      return [];
    }
    return value;
  } catch {
    fail(`${path.relative(ROOT, file)}: JSON 无法解析`);
    return [];
  }
}

async function checkExams() {
  const ids = new Set();
  for (const type of ['english1', 'english2']) {
    const directory = path.join(ROOT, 'data', 'exams', type);
    const files = await jsonFiles(directory);
    stats.examFiles += files.length;
    for (const file of files) {
      const label = path.relative(ROOT, file);
      const year = Number(path.basename(file, '.json'));
      if (!Number.isInteger(year)) fail(`${label}: 文件名必须是四位年份`);
      const items = await readArray(file);
      for (const [index, item] of items.entries()) {
        const where = `${label}[${index}]`;
        if (!isObject(item)) { fail(`${where}: 必须是对象`); continue; }
        if (typeof item.id !== 'string' || !item.id) fail(`${where}: 缺少 id`);
        else if (ids.has(item.id)) fail(`${where}: id 重复`);
        else ids.add(item.id);
        if (item.type !== type) fail(`${where}: type 必须为 ${type}`);
        if (item.year !== year) fail(`${where}: year 与文件名不一致`);
        if (typeof item.section !== 'string' || !item.section) fail(`${where}: 缺少 section`);
        if (typeof item.passage !== 'string' || item.passage.trim().length < 20) fail(`${where}: passage 过短`);
        if (!Array.isArray(item.questions) || item.questions.length === 0) fail(`${where}: 缺少 questions`);
        const questionIds = new Set();
        for (const [questionIndex, question] of (Array.isArray(item.questions) ? item.questions : []).entries()) {
          const q = `${where}.questions[${questionIndex}]`;
          if (!isObject(question)) { fail(`${q}: 必须是对象`); continue; }
          if (typeof question.id !== 'string' || !question.id) fail(`${q}: 缺少 id`);
          else if (questionIds.has(question.id)) fail(`${q}: 题目 id 重复`);
          else questionIds.add(question.id);
          if (typeof question.question !== 'string' || !question.question.trim()) fail(`${q}: 缺少题干`);
          if (!Array.isArray(question.options) || question.options.length !== 4) fail(`${q}: 必须有 4 个选项`);
          if (typeof question.answer !== 'string' || !/^[A-D]$/.test(question.answer)) fail(`${q}: answer 必须是 A-D`);
          stats.questions++;
        }
        stats.passages++;
      }
    }
  }
}

async function checkEssays() {
  const ids = new Set();
  for (const type of ['english1', 'english2']) {
    const directory = path.join(ROOT, 'data', 'essay-bank', type);
    const files = await jsonFiles(directory);
    stats.essayFiles += files.length;
    for (const file of files) {
      const label = path.relative(ROOT, file);
      const year = Number(path.basename(file, '.json'));
      const items = await readArray(file);
      for (const [index, item] of items.entries()) {
        const where = `${label}[${index}]`;
        if (!isObject(item)) { fail(`${where}: 必须是对象`); continue; }
        if (typeof item.id !== 'string' || !item.id) fail(`${where}: 缺少 id`);
        else if (ids.has(item.id)) fail(`${where}: id 重复`);
        else ids.add(item.id);
        if (item.type !== type) fail(`${where}: type 必须为 ${type}`);
        if (item.year !== year) fail(`${where}: year 与文件名不一致`);
        if (!['big', 'small'].includes(item.composition)) fail(`${where}: composition 必须是 big/small`);
        if (typeof item.directions !== 'string' || !item.directions.trim()) fail(`${where}: 缺少 directions`);
        if (typeof item.reviewed !== 'boolean') fail(`${where}: reviewed 必须是布尔值`);
        if (item.reviewed) stats.reviewedEssays++;
        if (item.materialImage !== undefined) {
          if (typeof item.materialImage !== 'string' || !item.materialImage.startsWith('/essay-materials/')) {
            fail(`${where}: materialImage 必须位于 /essay-materials/`);
          } else {
            const image = path.join(ROOT, 'public', item.materialImage.replace(/^\//u, ''));
            if (!existsSync(image)) fail(`${where}: 配图不存在`);
          }
        }
        stats.essays++;
      }
    }
  }
}

await checkExams();
await checkEssays();

if (requireData && stats.passages === 0 && stats.essays === 0) fail('启用了 --require-data，但没有找到本地题库');
if (errors.length) {
  console.error(`题库检查未通过，共 ${errors.length} 个问题：`);
  for (const error of errors.slice(0, 30)) console.error(`- ${error}`);
  if (errors.length > 30) console.error(`- 其余 ${errors.length - 30} 个问题已省略`);
  process.exitCode = 1;
} else {
  console.log('题库检查通过（未输出题目正文）。');
  console.log(`阅读：${stats.examFiles} 个文件，${stats.passages} 篇，${stats.questions} 题`);
  console.log(`作文：${stats.essayFiles} 个文件，${stats.essays} 题，其中已发布 ${stats.reviewedEssays} 题`);
  if (stats.passages === 0 && stats.essays === 0) console.log('当前为空题库；自由输入功能仍可使用。');
}
