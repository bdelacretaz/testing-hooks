const stringify = require('json-stringify');
const Octokit = require('@octokit/rest')
const octokit = new Octokit ()

// Compare: https://developer.github.com/v3/repos/#list-organization-repositories
octokit.repos.listForOrg({
  org: 'apache',
  type: 'public'
}).then(({ data, status, headers }) => {
  //console.log(stringify(data[i]))
  for (i in data) {
      console.log(stringify(data[i].full_name))
  }
})
