// Which test switches this copy of Bento listens to. The pretend AIs, the pretend usage limit and the dry-run publish
// only work in a test build (`npm run app`, CI: "bentoTestBuild" in package.json) or a copy run from source, and only
// in hidden test mode. A release ignores them.
//
// And a release that's asked for the pretend AIs (a test pointed at the wrong build) hides every AI instead: it must
// never quietly fall back to your real ones and spend your plan on a test.
/**
 * @param {{ packaged: boolean, testBuild?: boolean, offscreen: boolean, env?: Record<string, string | undefined> }} o
 */
function testHooks({ packaged, testBuild, offscreen, env = {} }) {
  const allowed = (!packaged || testBuild === true) && !!offscreen;
  const fakeAI = allowed && env.BENTO_FAKE_AI ? env.BENTO_FAKE_AI : null;
  return {
    fakeAI,
    fakeAs: String(env.BENTO_FAKE_AS || 'claude')
      .split(',')
      .filter(Boolean),
    fakeLimit: allowed ? String(env.BENTO_FAKE_LIMIT || '') : '',
    dryPublish: allowed && !!env.BENTO_DRY_PUBLISH,
    hideAllAIs: !!env.BENTO_FAKE_AI && !fakeAI,
  };
}
module.exports = { testHooks };
