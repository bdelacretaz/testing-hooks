// Enumerate a Git tree and extract tags from the
// front matter or MarkDown files
//
// TODO we're likely to hit GitHub API rate limits,
// the current values are provided as X-RateLimit-*
// response headers

const stringify = require('json-stringify');
const Octokit = require('@octokit/rest')
let octokit;
const Markdown = require('markdown-it');
const fmPlugin = require('markdown-it-front-matter');
const fmParser = require('front-matter');

const branchDef = {
  owner: 'bdelacretaz',
  repo: 'testing-hooks',
  branch: 'master',
}

const processFrontMatter = (tags, path, data) => {
  var frontMatter = fmParser(`---\n${data}\n---`);
  frontMatter.attributes.tags.split(',').forEach(rawTag =>{
    const tag = rawTag.replace(/\s+/g,'');
    // TODO how to synchronize access to tag[tag] ?
    if(!tags[tag]) {
      tags[tag] = [];
    }
    tags[tag].push(path);
  });
};

const processItem = async (tags, item) => {
  if(item.type == 'blob' && item.path.endsWith('.md')) {
    await octokit.repos.getContents({
      owner: branchDef.owner,
      repo: branchDef.repo,
      path: item.path,
    })
    .then(response => {
      const content = Buffer.from(response.data.content, 'base64').toString();
      return content;
    })
    .then(async content => {
      const md = new Markdown();
      md.use(fmPlugin, result => processFrontMatter(tags, item.path, result));
      await md.parse(content);
    });
  }
};

const main = async (params) => {
  // TODO this doesn't seem to help with rate limitation, and
  // an invalid token produces no error
  octokit = new Octokit ({auth: params.githubSecret});

  const result = {
    description: 'List of front matter tags found in the specified GitHub source',
    source: {},
    tags: {},
  };

  octokit.repos.getBranch(params.branchDef)
  .then(response => {
    result.source.branchURL = response.data._links.self;
    result.source.sha = response.data.commit.sha;
    return result;
  })
  .then(result => {
    return octokit.git.getTree({
      owner: branchDef.owner,
      repo: branchDef.repo,
      tree_sha: result.source.sha,
      recursive: 1,
    })
  })
  .then(async response => {
    if(response.data.truncated) {
      throw new Error("For now, unable to handle truncated responses - need to implement paging");
    }
    await Promise.all(response.data.tree.map(item => processItem(result.tags, item)));
    result.creationDate = new Date();
    console.log(result);
    })
  .catch(e => { 
    console.log(e); 
  });
}

if (require.main === module) {
  main({
    githubSecret: process.argv[2],
    branchDef: branchDef,
  });
}

module.exports.main = main;