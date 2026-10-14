# Agent World

A 3D pixel-toy world where the agents behind the owner's GitHub repos live and work. It only reads published run data and shows what each agent is doing.

## Language

**Agent**:
Anything that does work for a repo and has a building and a little character in the world: a GitHub Actions workflow, Claude, the auto-commit bot, the owner, a Cowork task, or a live website.
_Avoid_: Bot, job, thread (the side panel says "threads", but they are agents)

**Working**:
An agent that is running a task right now. Its astronaut is seen at work: picking something up at its building, carrying it to the base in the middle of its hexagon, dropping it off and walking back, over and over.
_Avoid_: Active, busy, live

**Asleep**:
How the world shows every agent that is not working, whatever it is waiting for (its next scheduled run, a request, nothing at all), and also one whose last run failed, which keeps a flashing "!" as well. Lying down at its building with a big "zzz" above its head. There is nothing in between: an astronaut is either at work or asleep, and never wanders about.
_Avoid_: Inactive, disabled, idle, waiting

**Website**:
A live website the world watches, listed under `sites` in `src/config.mjs`: an island of its own with one agent, working while the site answers and failing when it does not. Only whether it answers is known, never what it says.
_Avoid_: Repo, page, app

**Shown repos**:
The GitHub repos the world draws, listed under `repos` in `src/config.mjs`. A repo that is not on the list makes no island, no agent and no event, however active it is. The lobby and the websites are not repos and are always drawn.
_Avoid_: Whitelist, filter

**Plumbing**:
A workflow that builds or checks a repo (a Pages deploy, a smoke check, CI) and does no job of its own. Listed in `skipWorkflows` in `src/config.mjs`; it gets no building and no astronaut.
_Avoid_: Agent

**Failing**:
An agent whose last run failed. Shown like an asleep one, with a flashing red "!" over it.
_Avoid_: Broken, errored

**Overview**:
The panel on the right for someone who wants the picture at a glance: the totals (working, asleep, failing), a one-line verdict, the failing agents, and every repo with a bar of its mix, the ones to look at first on top.
_Avoid_: Dashboard, thread list

**Design**:
Which of the seven looks an island has (its base and its floor pattern). Each island takes the next one, so neighbouring islands never match.
_Avoid_: Theme, skin

**Activate**:
To get an agent that is not working to start a run now, with the **Work** button on its card. For a GitHub workflow it starts the run; for an agent outside GitHub it only points the owner to where they can start it. Everyone sees the button; for a viewer who is not signed in it asks them to sign in, and for Claude, the bot and the owner it is disabled with a note, because they cannot be started from here.
_Avoid_: Wake, trigger, run now (the button says Work, the concept is Activate)

**Task**:
One job a CRM does on a schedule or on demand: a GitHub workflow in a CRM repo (a scan, a discovery, a report). Each task is one agent and stands on its CRM's island, with the CRM's website agent.
_Avoid_: Job (GitHub's word for a group of steps inside one run), step

**Progress**:
How far the run a working task is in has got, as a percentage. Exact when the run reports its steps, otherwise an estimate from how long the task usually takes, shown with a "≈". A task that is not working has no progress; it shows its last result and when it runs next.
_Avoid_: Completion, status

**Analytics**:
The figures drawn from a task's past runs (success rate, average duration, how long runs take over time, failure streaks) and, for a whole CRM, the same totals side by side with the other CRMs.
_Avoid_: Stats, metrics, report

**District**:
A group of task agents on one island that do the same kind of job (news, contacts, competitors, research, reports), standing together.
_Avoid_: Zone, cluster

**Stuck**:
A working task whose run has taken much longer than that task usually does. Shown amber first, then red.
_Avoid_: Hung, frozen

**Wake several**:
Activating several tasks of one CRM in one go. At most three run together; the rest wait their turn.
_Avoid_: Bulk run, batch

**Personal choice**:
A setting a visitor makes only for themselves (effects on or off, the feed open, and later colours, names, sound, the tour). Kept in that visitor's own browser, never sent anywhere and never seen by anyone else; the page works the same when the browser will not keep it.
_Avoid_: Preference, setting (those suggest it is shared)

**Custom colour**:
The suit and helmet colours chosen for an agent by whoever is looking, in place of the colours its kind gives it. Kept in that person's own browser only.
_Avoid_: Skin, theme

**Admin**:
The owner while signed in. Only the Admin can use the Work button for real; everyone else is asked to sign in.
_Avoid_: User, viewer (a viewer is anyone who is not the Admin)
