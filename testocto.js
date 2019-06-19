// Enumerate a Git tree and extract tags from the
// front matter or MarkDown files
//
// TODO we're likely to hit GitHub API rate limits,
// the current values are provided as X-RateLimit-*
// response headers

const stringify = require('json-stringify');
const Octokit = require('@octokit/rest')
const octokit = new Octokit ()

const branchDef = {
  owner: 'bdelacretaz',
  repo: 'testing-hooks',
  branch: 'master',
}

const processItem = (tags, item) => {
  if(item.type == 'blob' && item.path.endsWith('.md')) {
    octokit.repos.getContents({
      owner: branchDef.owner,
      repo: branchDef.repo,
      path: item.path,
    })
    .then(response => {
      const content = Buffer.from(response.data.content, 'base64').toString();
      console.log(content.substr(0,80));      
      tags[item.path] = 1;
    })
  }
};

const main = async (branch) => {
  const response = await octokit.repos.getBranch(branch);
  const branchURL = response.data._links.self;
  const sha = response.data.commit.sha;

  console.log(`Getting tree from ${branchURL}, sha=${sha}`);

  octokit.git.getTree({
    owner: branchDef.owner,
    repo: branchDef.repo,
    tree_sha: sha,
    recursive: 1,
  })
  .then(response => {
    const tags = {};
    if(response.data.truncated) {
      throw new Error("For now, unable to handle truncated responses - need to implement paging");
    }
    response.data.tree.forEach(item => {
      processItem(tags, item);
    })

    return tags;
  })
  .then(tags => {
    console.log(tags);
  })
  .catch(e => { console.log(e); });
}

main(branchDef);
