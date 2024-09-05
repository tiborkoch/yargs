// Copyright 2023 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import * as core from '@actions/core';
import { GitHub, Manifest, registerVersioningStrategy, VERSION, } from 'release-please';
import { fileURLToPath } from "node:url";
import { DefaultVersioningStrategy } from "./default.js";
const DEFAULT_CONFIG_FILE = 'release-please-config.json';
const DEFAULT_MANIFEST_FILE = '.release-please-manifest.json';
const DEFAULT_GITHUB_API_URL = 'https://api.github.com';
const DEFAULT_GITHUB_GRAPHQL_URL = 'https://api.github.com';
const DEFAULT_GITHUB_SERVER_URL = 'https://github.com';
function parseInputs() {
    const inputs = {
        token: core.getInput('token', { required: true }),
        releaseType: getOptionalInput('release-type'),
        path: getOptionalInput('path'),
        repoUrl: core.getInput('repo-url') || process.env.GITHUB_REPOSITORY || '',
        targetBranch: getOptionalInput('target-branch'),
        configFile: core.getInput('config-file') || DEFAULT_CONFIG_FILE,
        manifestFile: core.getInput('manifest-file') || DEFAULT_MANIFEST_FILE,
        githubApiUrl: core.getInput('github-api-url') || DEFAULT_GITHUB_API_URL,
        githubGraphqlUrl: (core.getInput('github-graphql-url') || '').replace(/\/graphql$/, '') ||
            DEFAULT_GITHUB_GRAPHQL_URL,
        proxyServer: getOptionalInput('proxy-server'),
        skipGitHubRelease: getOptionalBooleanInput('skip-github-release'),
        skipGitHubPullRequest: getOptionalBooleanInput('skip-github-pull-request'),
        fork: getOptionalBooleanInput('fork'),
        includeComponentInTag: getOptionalBooleanInput('include-component-in-tag'),
        changelogHost: core.getInput('changelog-host') || DEFAULT_GITHUB_SERVER_URL,
    };
    return inputs;
}
function getOptionalInput(name) {
    return core.getInput(name) || undefined;
}
function getOptionalBooleanInput(name) {
    const val = core.getInput(name);
    if (val === '' || val === undefined) {
        return undefined;
    }
    return core.getBooleanInput(name);
}
function loadOrBuildManifest(github, inputs) {
    registerVersioningStrategy("customTest", options => new DefaultVersioningStrategy(options));
    if (inputs.releaseType) {
        core.debug('Building manifest from config');
        return Manifest.fromConfig(github, github.repository.defaultBranch, {
            releaseType: inputs.releaseType,
            includeComponentInTag: inputs.includeComponentInTag,
            changelogHost: inputs.changelogHost,
            versioning: 'always-bump-patch'
        }, {
            fork: inputs.fork,
        }, inputs.path);
    }
    const manifestOverrides = inputs.fork
        ? {
            fork: inputs.fork,
        }
        : {};
    core.debug('Loading manifest from config file');
    return Manifest.fromManifest(github, github.repository.defaultBranch, inputs.configFile, inputs.manifestFile, manifestOverrides);
}
export async function main() {
    core.info(`Running release-please version: ${VERSION}`);
    const inputs = parseInputs();
    const github = await getGitHubInstance(inputs);
    if (!inputs.skipGitHubRelease) {
        const manifest = await loadOrBuildManifest(github, inputs);
        core.debug('Creating releases');
        outputReleases(await manifest.createReleases());
    }
    if (!inputs.skipGitHubPullRequest) {
        const manifest = await loadOrBuildManifest(github, inputs);
        core.debug('Creating pull requests');
        outputPRs(await manifest.createPullRequests());
    }
}
function getGitHubInstance(inputs) {
    const [owner, repo] = inputs.repoUrl.split('/');
    let proxy = undefined;
    if (inputs.proxyServer) {
        const [host, port] = inputs.proxyServer.split(':');
        proxy = {
            host,
            port: Number.parseInt(port),
        };
    }
    const githubCreateOpts = {
        proxy,
        owner,
        repo,
        apiUrl: inputs.githubApiUrl,
        graphqlUrl: inputs.githubGraphqlUrl,
        token: inputs.token,
        defaultBranch: inputs.targetBranch,
    };
    return GitHub.create(githubCreateOpts);
}
function setPathOutput(path, key, value) {
    if (path === '.') {
        core.setOutput(key, value);
    }
    else {
        core.setOutput(`${path}--${key}`, value);
    }
}
function outputReleases(releases) {
    const updatedReleases = releases.filter((release) => release !== undefined);
    const pathsReleased = [];
    core.setOutput('releases_created', updatedReleases.length > 0);
    if (updatedReleases.length) {
        for (const release of updatedReleases) {
            if (!release) {
                continue;
            }
            const path = release.path || '.';
            if (path) {
                pathsReleased.push(path);
                // If the special root release is set (representing project root)
                // and this is explicitly a manifest release, set the release_created boolean.
                setPathOutput(path, 'release_created', true);
            }
            for (const [rawKey, value] of Object.entries(release)) {
                let key = rawKey;
                // Historically tagName was output as tag_name, keep this
                // consistent to avoid breaking change:
                if (key === 'tagName')
                    key = 'tag_name';
                if (key === 'uploadUrl')
                    key = 'upload_url';
                if (key === 'notes')
                    key = 'body';
                if (key === 'url')
                    key = 'html_url';
                setPathOutput(path, key, value);
            }
        }
    }
    // Paths of all releases that were created, so that they can be passed
    // to matrix in next step:
    core.setOutput('paths_released', JSON.stringify(pathsReleased));
}
function outputPRs(prs) {
    const updatedPrs = prs.filter((pr) => pr !== undefined);
    core.setOutput('prs_created', updatedPrs.length > 0);
    if (updatedPrs.length) {
        core.setOutput('pr', updatedPrs[0]);
        core.setOutput('prs', JSON.stringify(updatedPrs));
    }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        core.setFailed(`release-please failed: ${err.message}`);
    });
}
