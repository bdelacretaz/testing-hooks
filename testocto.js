// Enumerate a Git tree and extract tags from the
// front matter or MarkDown files
//
// TODO we're likely to hit GitHub API rate limits,
// the current values are provided as X-RateLimit-*
// response headers

const stringify = require('json-stringify');
const Octokit = require('@octokit/rest')
let octokit;
const md = require('markdown-it')();
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
  console.log(`tags for ${path} = ${JSON.stringify(tags, null, 2)}`);
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
      md.use(fmPlugin, result => processFrontMatter(tags, item.path, result));
      await md.parse(content);
    });
  }
};

const main = async (params) => {
  // TODO this doesn't seem to help with rate limitation, and
  // an invalid token produces no error
  octokit = new Octokit ({auth: params.githubSecret});

  octokit.repos.getBranch(params.branchDef)
  .then(response => {
    const branchURL = response.data._links.self;
    const sha = response.data.commit.sha;
    console.log(`Getting tree from ${branchURL}, sha=${sha}`);
    return sha;
  })
  .then(sha => {
    return octokit.git.getTree({
      owner: branchDef.owner,
      repo: branchDef.repo,
      tree_sha: sha,
      recursive: 1,
    })
  })
  .then(async response => {
    const tags = {};
    if(response.data.truncated) {
      throw new Error("For now, unable to handle truncated responses - need to implement paging");
    }
    await Promise.all(response.data.tree.map(item => processItem(tags, item)));
    return tags;
    })
  .then(tags => {
    console.log('Final tags:');
    console.log(tags);
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