# Pull-based deploy on Loki — how to

Loki deploys itself: `scripts/deploy/pull-deploy.sh`, run every five minutes as
the user that owns the stack, deploys the head of one branch of the public
repository once it is a fast-forward of what runs and every check-run on it is
green. Nothing on GitHub can reach or command Loki. Why it is built this way,
and every check it makes: `docs/architecture/deploy-loki.md` §2.6. The deploy
sequence and what happens on failure: §4.1.

Everything below runs on Loki, as that user (`loki`), with no sudo.

| Path | What |
|---|---|
| `~/.local/lib/cellar-pull-deploy/pull-deploy.sh` | the deployer the schedule runs (`D` below) |
| `~/.config/cellar-pull-deploy/config` | branch, vhost.d path, CI-gate knobs (`pull-deploy.env.example`) |
| `~/cellar-prod/DEPLOYED_SHA` | the commit that runs |
| `~/cellar-prod/state/status.json` | last check, last attempt (result, failing step, log), last success |
| `~/cellar-prod/state/release.env` | the running images and config fingerprints |
| `~/cellar-prod/logs/pull-deploy.log` | one line per change of state; `deploy-<sha8>-<time>.log` per attempt |
| `~/cellar-prod/releases/<sha>/` | each deployed commit's tree (the newest three kept; never the running one or the one it replaced) |
| `~/cellar-prod/repo.git` | bare mirror the deployer fetches into |

```bash
D=~/.local/lib/cellar-pull-deploy/pull-deploy.sh
```

## First install

1. **Get the installer from a commit you have reviewed**, by its sha, from the
   public repository (no checkout of the stack is touched):

   ```bash
   git init -q --bare ~/cellar-prod/repo.git 2>/dev/null || true
   git -C ~/cellar-prod/repo.git fetch -q https://github.com/MrMint/cellar-assistant.git <branch>
   t=$(mktemp -d); git -C ~/cellar-prod/repo.git archive <sha> | tar -x -C "$t"
   "$t/infra/loki/install-pull-deploy.sh"; rm -rf "$t"
   ```

   It installs `D`, creates the config (mode 600) if there is none, and
   schedules `D`: a systemd user timer if `loginctl show-user loki -p Linger`
   says `yes`, otherwise a crontab line (linger was `no` on 2026-10-05, so
   cron). Re-running it is safe and is how the deployer itself is updated —
   new releases never replace `D` on their own, so a commit cannot change the
   code that judges it.

2. **Edit the config:** `NGINX_PROXY_VHOST_DIR` (required; on Loki
   `/home/loki/Documents/nginx/vhost.d`) and `PULL_DEPLOY_BRANCH`
   (`migrate-off-nhost` until the migration is merged; then `main`, or
   `production` to deploy releases only).

3. **Adopt the hand-made first deploy's tree**, once, if `~/cellar-prod/src` is
   a directory (the installer warns). The deployer never replaces a real
   directory there, so without this `src` goes stale after the first pull
   deploy:

   ```bash
   cd ~/cellar-prod && sha=$(cat DEPLOYED_SHA) && mkdir -p releases \
     && mv src "releases/$sha" && ln -s "releases/$sha" src
   ```

   Running containers keep their bind mounts across the move, and a restart
   resolves the same files through the link.

4. **Make the compose wrapper read the deployer's image pins.** Every compose
   call `D` makes exports the running release's `API_IMAGE`, `ACTORS_IMAGE`
   and config fingerprints, which beat `env/.env.prod`. A hand-run
   `./dc up` without them would roll the apps back to `.env.prod`'s images and
   recreate the fingerprinted services. In `~/cellar-prod/dc`:

   ```sh
   #!/bin/sh
   R="$HOME/cellar-prod/state/release.env"
   [ -f "$R" ] && set -- --env-file "$R" "$@"
   exec docker compose -p cellar-prod \
     -f "$HOME/cellar-prod/src/infra/docker-compose.yml" \
     -f "$HOME/cellar-prod/src/infra/docker-compose.prod.yml" \
     --env-file "$HOME/cellar-prod/env/.env.prod" "$@"
   ```

5. **Watch the first tick:** `$D status`, and `tail -f ~/cellar-prod/logs/pull-deploy.log`.
   The first pull deploy recreates `otel-lgtm` and both Dapr sidecars once,
   because their config-fingerprint labels go from empty (the hand-made deploy
   set none) to a hash.

## Day to day

```bash
$D status                       # what runs, what the last tick saw, the last attempt
$D                              # one tick now, instead of waiting for the timer
$D --force                      # redeploy the branch head even if it already runs
                                # (e.g. after editing env/.env.prod), or retry a
                                # commit whose deploy failed
$D pause                        # timer ticks do nothing until…
$D resume
```

A tick that finds nothing new writes nothing to the log. A commit whose CI is
still running, or has no check-runs yet, is `waiting`; one with a failed check
is `refused` (exit 3) and re-checked every tick, so re-running the failed job on
GitHub is enough. A commit whose *deploy* failed is `held`: the timer does not
retry it, so push a fix or run `$D --force`.

## Rolling back

A deploy that fails rolls itself back (deploy-loki.md §4.1). For one that
succeeded but is wrong:

```bash
$D pause                        # otherwise the next tick deploys the branch head again
$D --sha <older-sha>            # any commit reachable from the branch; same checks,
                                # same verification; its tree and images are reused
                                # if still kept
# fix forward on the branch, then
$D resume
```

The schema is not rolled back — migrations are forward-only, and the older
actor host runs against the newer schema by design (§4.1). In an emergency where
CI cannot go green, `$D --sha <sha> --skip-ci` skips the CI gate only; it is
logged.

## When it says `rollback_failed`

The new release failed and re-applying the previous one did not verify either.
Nothing was taken down, but something is wrong that needs a human: read the
attempt's log (`jq -r .last_attempt.log ~/cellar-prod/state/status.json`), then
deploy-loki.md §4.1's by-hand steps from the release tree you want running.

## Uninstall

```bash
~/.local/lib/cellar-pull-deploy/pull-deploy.sh pause
<a release tree>/infra/loki/install-pull-deploy.sh uninstall
```

Removes the schedule and `D`; keeps the config, `state/`, `logs/`,
`releases/` and the running stack.
