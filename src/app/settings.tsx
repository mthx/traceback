import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Plus, X } from "lucide-react";

export function Settings() {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [gitFolder, setGitFolder] = useState<string>("");
  const [zenProfilePath, setZenProfilePath] = useState<string>("");
  const [isDetecting, setIsDetecting] = useState(false);
  const [githubOrgs, setGithubOrgs] = useState<string[]>([]);
  const [newOrgName, setNewOrgName] = useState<string>("");

  useEffect(() => {
    loadGitFolder();
    loadZenProfilePath();
    loadGitHubOrgs();
  }, []);

  async function loadGitFolder() {
    try {
      const folder = await invoke<string | null>("get_setting", {
        key: "git_dev_folder",
      });
      if (folder) {
        setGitFolder(folder);
      }
    } catch (err) {
      console.error("Error loading git folder:", err);
    }
  }

  async function loadZenProfilePath() {
    try {
      const path = await invoke<string | null>("get_zen_profile_path");
      if (path) {
        setZenProfilePath(path);
      }
    } catch (err) {
      console.error("Error loading zen profile path:", err);
    }
  }

  async function browseFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: gitFolder || undefined,
      });

      if (selected && typeof selected === "string") {
        setGitFolder(selected);

        // Auto-save the selected folder
        try {
          await invoke("set_setting", {
            key: "git_dev_folder",
            value: selected,
          });
        } catch (err) {
          setError(err as string);
          console.error("Error saving git folder:", err);
        }
      }
    } catch (err) {
      console.error("Error browsing folder:", err);
    }
  }

  async function browseZenProfile() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: zenProfilePath || undefined,
      });

      if (selected && typeof selected === "string") {
        setZenProfilePath(selected);

        // Auto-save the selected profile path
        try {
          await invoke("set_zen_profile_path", { path: selected });
          setSuccess("Zen profile path saved successfully");
        } catch (err) {
          setError(err as string);
          console.error("Error saving zen profile path:", err);
        }
      }
    } catch (err) {
      console.error("Error browsing zen profile:", err);
    }
  }

  async function autoDetectZenProfile() {
    setIsDetecting(true);
    try {
      const detected = await invoke<string | null>(
        "auto_detect_zen_profile_path"
      );
      if (detected) {
        setZenProfilePath(detected);
        await invoke("set_zen_profile_path", { path: detected });
        setSuccess("Zen profile auto-detected successfully");
      } else {
        setError(
          "Could not auto-detect Zen profile. Please select it manually."
        );
      }
    } catch (err) {
      setError(err as string);
      console.error("Error auto-detecting zen profile:", err);
    } finally {
      setIsDetecting(false);
    }
  }

  async function loadGitHubOrgs() {
    try {
      const orgs = await invoke<string[]>("get_github_orgs");
      setGithubOrgs(orgs);
    } catch (err) {
      console.error("Error loading GitHub orgs:", err);
    }
  }

  async function addGitHubOrg() {
    if (!newOrgName.trim()) return;

    try {
      await invoke("add_github_org", { orgName: newOrgName.trim() });
      setNewOrgName("");
      await loadGitHubOrgs();
      setSuccess("GitHub org added successfully");

      // Reset cache in calendar view
      const { resetGitHubOrgsCache } =
        await import("@/components/calendar-view");
      resetGitHubOrgsCache();
    } catch (err) {
      setError(err as string);
      console.error("Error adding GitHub org:", err);
    }
  }

  async function removeGitHubOrg(orgName: string) {
    try {
      await invoke("remove_github_org", { orgName });
      await loadGitHubOrgs();
      setSuccess("GitHub org removed successfully");

      // Reset cache in calendar view
      const { resetGitHubOrgsCache } =
        await import("@/components/calendar-view");
      resetGitHubOrgsCache();
    } catch (err) {
      setError(err as string);
      console.error("Error removing GitHub org:", err);
    }
  }

  async function handleClearAllData() {
    try {
      await invoke("reset_database");
      setIsDeleteOpen(false);
      console.log("All data cleared");
      window.location.reload();
    } catch (err) {
      setError(err as string);
      console.error("Error clearing data:", err);
    }
  }

  // Auto-clear messages after 5 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <div className="px-4 py-4 pb-6 max-w-2xl">
      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive text-destructive rounded-md text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded-md text-sm">
          {success}
        </div>
      )}

      <div className="space-y-8">
        {/* Git Folder Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Git Repository Folder</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Path to your development folder containing git repositories. Git
              activity will be automatically synced from all repositories found
              within this folder (up to 2 levels deep).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="git-folder">Development Folder Path</Label>
            <div className="flex gap-2">
              <Input
                id="git-folder"
                value={gitFolder}
                placeholder="/Users/username/Development"
                className="flex-1"
                readOnly
              />
              <Button variant="outline" onClick={browseFolder}>
                Browse...
              </Button>
            </div>
          </div>
        </div>

        {/* Zen Browser Profile Section */}
        <div className="space-y-4 pt-4 border-t">
          <div>
            <h2 className="text-lg font-semibold">Zen Browser Profile</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Path to your Zen browser profile folder. Browser history from
              work-related domains will be automatically synced.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="zen-profile">Profile Path</Label>
            <div className="flex gap-2">
              <Input
                id="zen-profile"
                value={zenProfilePath}
                placeholder="/Users/username/Library/Application Support/zen/Profiles/..."
                className="flex-1"
                readOnly
              />
              <Button
                variant="outline"
                onClick={autoDetectZenProfile}
                disabled={isDetecting}
              >
                {isDetecting ? "Detecting..." : "Auto-detect"}
              </Button>
              <Button variant="outline" onClick={browseZenProfile}>
                Browse...
              </Button>
            </div>
            {!zenProfilePath && (
              <p className="text-xs text-muted-foreground">
                Click "Auto-detect" to find your Zen profile automatically, or
                browse to select it manually.
              </p>
            )}
          </div>
        </div>

        {/* GitHub Organizations Section */}
        <div className="space-y-4 pt-4 border-t">
          <div>
            <h2 className="text-lg font-semibold">GitHub Organizations</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Specify which GitHub organizations contain your focused work
              repositories. GitHub visits to these orgs will be aggregated
              per-repository, while other GitHub activity will be grouped under
              a general "GitHub" category.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-org">Add Organization</Label>
            <div className="flex gap-2">
              <Input
                id="new-org"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="e.g., facebook, microsoft, mycompany"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addGitHubOrg();
                  }
                }}
              />
              <Button onClick={addGitHubOrg} disabled={!newOrgName.trim()}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
            {githubOrgs.length > 0 && (
              <div className="mt-4 space-y-2">
                <Label>Configured Organizations ({githubOrgs.length})</Label>
                <div className="space-y-1">
                  {githubOrgs.map((org) => (
                    <div
                      key={org}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                    >
                      <span className="text-sm font-mono">{org}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeGitHubOrg(org)}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Clear Data Section */}
        <div className="space-y-4 pt-4 border-t">
          <div>
            <h2 className="text-lg font-semibold text-destructive">
              Clear All Data
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              This will permanently delete all your projects, events, rules, and
              other data. This action is irreversible.
            </p>
          </div>
          <Button
            variant="outline"
            className="text-destructive border-destructive hover:bg-destructive/10"
            onClick={() => setIsDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear all data
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete all
              your data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearAllData}>
              Yes, delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
