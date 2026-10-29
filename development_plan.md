# Development Plan

This document records future ideas and decisions for PBN Cleaner. Items here are planning notes only; they do not imply that implementation has started.

## Small downloader / web installer

**Priority: Later; not critical right now.**

The current full installer is large because it includes the desktop runtime and bundled backend/data-processing libraries. A small downloader (also called a web installer or bootstrapper) could make the file shared with coworkers much smaller while downloading the same full application during setup.

### Possible approach

- Publish versioned installers and update metadata as **GitHub Releases**, rather than relying on a folder in the source repository.
- Distribute a small setup program that downloads the matching full installer from the release.
- Keep the full installer available as a fallback for offline installs or unreliable internet access.
- The installed app may continue working offline after installation; internet is required to download or retrieve updates.

### Future in-app update behavior

- The app can check GitHub Releases for a newer version and offer to download it.
- Show the version and release notes, and let the user choose whether to update.
- Require confirmation before installing; do not silently execute an arbitrary downloaded installer.
- Download only from a trusted HTTPS release and verify the download using publisher signing and/or a cryptographic checksum before starting installation.
- Preserve user data, which should remain separate from application files; back it up before any future update that changes the data format.

### Tradeoffs and open questions

- This reduces the size of the initial setup file, not the total bytes downloaded or the installed application's storage use.
- Internet access is needed during setup and whenever updates are retrieved.
- Decide later whether coworkers can access a public GitHub release or whether releases need a company-controlled/private distribution location.
- Keep update delivery optional until releases are stable and there is a clear process for publishing and validating each version.
