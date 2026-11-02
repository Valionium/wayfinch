// Where Load Check's page and the old offline worker are, for every suite.
// LC_PAGE and LC_WORKER override them (paths relative to the repository root, or absolute).
const path=require('node:path');
const root=path.join(__dirname,'..');
module.exports={
  root,
  page:path.resolve(root,process.env.LC_PAGE||'public/tools/bags/index.html'),
  worker:path.resolve(root,process.env.LC_WORKER||'qa/fixtures/legacy-offline-worker.js'),
};
