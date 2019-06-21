// Computes a map of front matter tags to paths for an 
// input GitHub repository and stores the result in 
// another one.
//
// See https://github.com/bdelacretaz/scratch for
// example output.
//
// GitHub API rate limits might be an issue, but they
// are much higher with authenticated requests (which we
// are using) than anonymous ones.
// The current limits are provided as X-RateLimit-*
// response headers.

const stringify = require('json-stringify');
const Octokit = require('@octokit/rest');
let octokit;
const Markdown = require('markdown-it');
const fmPlugin = require('markdown-it-front-matter');
const fmParser = require('front-matter');

const settings = {
  moduleName: 'get-markdown-tags',
  input: {
    owner: 'bdelacretaz',
    repo: 'testing-hooks',
    branch: 'master',
  },
  output: {
    owner: 'bdelacretaz',
    repo: 'scratch',
  }
}

const processFrontMatter = (tags, path, data) => {
  const frontMatter = fmParser(`---\n${data}\n---`);
  if(!frontMatter.attributes || !frontMatter.attributes.tags) {
    return;
  }
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
      owner: settings.input.owner,
      repo: settings.input.repo,
      path: item.path,
    })
    .then(response => {
      const content = Buffer.from(response.data.content, 'base64').toString();
      return content;
    })
    .then(async content => {
      const md = new Markdown();
      md.use(fmPlugin, result => processFrontMatter(tags, item.path, result));
      try {
        await md.parse(content);
      } catch(e) {
        console.log(e);
      }
    });
  }
};

const main = async (params) => {
  const { githubSecret } = params;
  if(!githubSecret) {
    throw new Error("Missing githubSecret");
  }
  const opts = { 
    auth: `token ${githubSecret}`,
    userAgent: settings.moduleName,
    /*
    log: {
      debug: console.debug,
      info: console.info,
      warn: console.warn,
      error: console.error,
    },
    */
  };
  octokit = Octokit(opts);

  // Verify that we are authenticated
  const { data:userData } = await octokit.users.getAuthenticated();

  const result = {
    description: 'List of front matter tags found in the specified GitHub source',
    source: {
      octokitUser: userData.login,
    },
    tags: {},
  };

  octokit.repos.getBranch(params.settings.input)
  .then(response => {
    result.source.branchURL = response.data._links.self;
    result.source.sha = response.data.commit.sha;
    return result;
  })
  .then(result => {
    return octokit.git.getTree({
      owner: settings.input.owner,
      repo: settings.input.repo,
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
    return result;
    })
  .then(async tags => {
    const param = {
      owner: settings.output.owner,
      repo: settings.output.repo,
      path: `tags-${settings.input.owner}-${settings.input.repo}.json`,
      message: `Tags file created by ${settings.moduleName}`,
      content: Buffer.from(JSON.stringify(tags, null, 2)).toString('base64'),
    };
    try {
      // Need the file's sha if it exists already
      const { data:existingContent } = await octokit.repos.getContents(param);
      param.sha = existingContent.sha;
      param.message = `Tags file updated by ${settings.moduleName}`;
    } catch(ignore) {
      // happens if the file doesn't exist yet
    }
    await octokit.repos.createFile(param);
    console.log(`Result stored at ${param.owner}/${param.repo}/${param.path}`);
  })
  .catch(e => { 
    console.log(e); 
  });
}

if (require.main === module) {
  main({
    githubSecret: process.argv[2],
    settings: settings,
  });
}

module.exports.main = main;
