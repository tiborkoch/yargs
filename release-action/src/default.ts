// Copyright 2021 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { ConventionalCommit, Logger } from 'release-please';
import {
  CustomVersionUpdate,
  MajorVersionUpdate,
  MinorVersionUpdate,
  PatchVersionUpdate,
  type VersioningStrategy,
  type VersionUpdater,
} from 'release-please/build/src/versioning-strategy.js';
import { logger as defaultLogger } from 'release-please/build/src/util/logger.js';
import { Version } from 'release-please/build/src/version.js';

export interface DefaultVersioningStrategyOptions {
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;
  logger?: Logger;
}

/**
 * This is the default VersioningStrategy for release-please. Breaking
 * changes should bump the major, features should bump the minor, and other
 * significant changes should bump the patch version.
 */
export class DefaultVersioningStrategy implements VersioningStrategy {
  readonly bumpMinorPreMajor: boolean;
  readonly bumpPatchForMinorPreMajor: boolean;
  protected logger: Logger;
  /**
   * Create a new DefaultVersioningStrategy
   * @param {DefaultVersioningStrategyOptions} options Configuration options
   * @param {boolean} options.bumpMinorPreMajor If the current version is less than 1.0.0,
   *   then bump the minor version for breaking changes
   * @param {boolean} options.bumpPatchForMinorPreMajor If the current version is less than
   *   1.0.0, then bump the patch version for features
   */
  constructor(options: DefaultVersioningStrategyOptions = {}) {
    this.bumpMinorPreMajor = options.bumpMinorPreMajor === true;
    this.bumpPatchForMinorPreMajor = options.bumpPatchForMinorPreMajor === true;
    this.logger = options.logger ?? defaultLogger;
  }

  /**
   * Given the current version of an artifact and a list of commits,
   * return a VersionUpdater that knows how to bump the version.
   *
   * This is useful for chaining together versioning strategies.
   *
   * @param {Version} version The current version
   * @param {ConventionalCommit[]} commits The list of commits to consider
   * @returns {VersionUpdater} Updater for bumping the next version.
   */
  determineReleaseType(
    version: Version,
    commits: ConventionalCommit[],
  ): VersionUpdater {
    // iterate through list of commits and find biggest commit type
    let breaking = 0;
    let features = 0;
    for (const commit of commits) {
      console.log('COMMIT_TYPE', commit.type);
      const releaseAs = commit.notes.find(
        (note) => note.title === 'RELEASE AS',
      );
      if (releaseAs) {
        // commits are handled newest to oldest, so take the first one (newest) found
        this.logger.debug(
          `found Release-As: ${releaseAs.text}, forcing version`,
        );
        return new CustomVersionUpdate(
          Version.parse(releaseAs.text).toString(),
        );
      }
      if (commit.breaking) {
        breaking++;
      } else if (
        commit.type === 'feat' ||
        commit.type === 'feature' ||
        commit.type === 'chore' ||
        commit.type === 'refactor'
      ) {
        features++;
      }
    }

    console.log('BBBBB', breaking);

    if (breaking > 0) {
      if (version.isPreMajor && this.bumpMinorPreMajor) {
        return new MinorVersionUpdate();
      }
      return new MajorVersionUpdate();
    }

    if (features > 0) {
      if (version.isPreMajor && this.bumpPatchForMinorPreMajor) {
        return new PatchVersionUpdate();
      }
      return new MinorVersionUpdate();
    }

    return new NoVersionUpdate();
    // return new PatchVersionUpdate();
  }

  /**
   * Given the current version of an artifact and a list of commits,
   * return the next version.
   *
   * @param {Version} version The current version
   * @param {ConventionalCommit[]} commits The list of commits to consider
   * @returns {Version} The next version
   */
  bump(version: Version, commits: ConventionalCommit[]): Version {
    return this.determineReleaseType(version, commits).bump(version);
  }
}

export class NoVersionUpdate implements VersionUpdater {
  /**
   * Returns the new bumped version
   *
   * @param {Version} version The current version
   * @returns {Version} The bumped version
   */
  bump(version: Version): Version {
    return new Version(
      version.major,
      version.minor,
      version.patch,
      version.preRelease,
      version.build
    );
  }
}