---
bump: none
desktop: unchanged
browser: unchanged
phone: unchanged
website: unchanged
docs: changed
---

## Technical

- Server tests no longer time out waiting for a background job that is slow but still moving. The job
  manager counts every write to a job and wakes anyone waiting on it; the tests' `wait_job` sleeps on
  that signal instead of polling the API and fails only when a job stops changing for 10 seconds, with
  the job's state and every thread's stack. It removes the "job did not finish" failures of two export
  tests on a busy Windows runner, where each sentence's database commits waited for slow disk flushes.
- The sound-detection speed check measures its thread's CPU time instead of the wall clock, so other
  test workers sharing the CPUs no longer count against its budget.
- Vitest starts one worker per free CPU (at most one per core on big machines), sampled when it loads
  its configuration, so CPU-bound web tests keep their headroom on a busy machine; an idle CI runner
  keeps its usual count. The offline-server flow moves a fake clock past the retry backoff instead of
  waiting 3 s for it.
