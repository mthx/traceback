import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Project, ProjectRule, StoredEvent } from "../types/event";
import { parseEventData, parseGitEventData } from "../types/event";

interface RuleEditDialogProps {
  project: Project | null;
  rule: ProjectRule | null;
  event: StoredEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRuleSaved: () => void;
}

export function RuleEditDialog({
  project,
  rule,
  event,
  open,
  onOpenChange,
  onRuleSaved,
}: RuleEditDialogProps) {
  const [formData, setFormData] = useState({
    ruleType: "title_pattern" as "organizer" | "title_pattern" | "repository",
    matchValue: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rule) {
      setFormData({
        ruleType: rule.rule_type as "organizer" | "title_pattern" | "repository",
        matchValue: rule.match_value,
      });
    } else if (event) {
      const eventData = parseEventData(event);
      const gitData = parseGitEventData(event);

      if (eventData?.organizer) {
        setFormData({
          ruleType: "organizer",
          matchValue: eventData.organizer,
        });
      } else if (gitData?.repository_name) {
        setFormData({
          ruleType: "repository",
          matchValue: gitData.repository_name,
        });
      } else {
        setFormData({
          ruleType: "title_pattern",
          matchValue: event.title,
        });
      }
    } else {
      setFormData({
        ruleType: "title_pattern",
        matchValue: "",
      });
    }
  }, [rule, event]);

  async function handleSave() {
    if (!project || !formData.matchValue.trim()) return;

    try {
      if (rule && rule.id) {
        // Update existing rule
        await invoke("update_project_rule", {
          ruleId: rule.id,
          ruleType: formData.ruleType,
          matchValue: formData.matchValue,
        });
      } else {
        // Create new rule
        await invoke("create_project_rule", {
          projectId: project.id,
          ruleType: formData.ruleType,
          matchValue: formData.matchValue,
        });
      }
      onRuleSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err as string);
      console.error("Error saving rule:", err);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {rule ? "Edit Classification Rule" : "Add Classification Rule"}
          </DialogTitle>
          <DialogDescription>
            {rule
              ? "Update the rule to automatically assign events to this project"
              : "Create a rule to automatically assign events to this project"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="rule-type">Rule Type</Label>
            <select
              id="rule-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={formData.ruleType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  ruleType: e.target.value as
                    | "organizer"
                    | "title_pattern"
                    | "repository",
                })
              }
            >
              <option value="title_pattern">Title contains text</option>
              <option value="organizer">Organizer email</option>
              <option value="repository">Git repository</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="match-value">
              {formData.ruleType === "organizer" && "Organizer Email"}
              {formData.ruleType === "title_pattern" && "Text to Match"}
              {formData.ruleType === "repository" && "Repository Name"}
            </Label>
            <Input
              id="match-value"
              placeholder={
                formData.ruleType === "organizer"
                  ? "user@example.com"
                  : formData.ruleType === "title_pattern"
                    ? "standup"
                    : "my-repo"
              }
              value={formData.matchValue}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  matchValue: e.target.value,
                })
              }
            />
          </div>
          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {rule ? "Save Changes" : "Add Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
