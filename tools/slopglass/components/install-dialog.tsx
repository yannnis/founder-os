"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function InstallDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Put it on LinkedIn</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Load the extension</DialogTitle>
          <DialogDescription>
            Chrome, Edge, Brave, and Arc can load it unpacked. On LinkedIn it marks each post Read, Skim, or Pass, and a
            meter totals the scroll or the profile.
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-4 text-sm leading-6 text-[#3a342c]">
          <li>
            <a className="underline underline-offset-2" href="/slopglass-extension.zip">
              Download Slopglass
            </a>{" "}
            and unzip it.
          </li>
          <li>
            Open <code className="rounded bg-[#f3efe6] px-1">chrome://extensions</code> and turn on Developer mode.
          </li>
          <li>Choose Load unpacked and pick the folder that contains manifest.json.</li>
          <li>Open the Slopglass popup and point it at this server. On this machine that is http://127.0.0.1:38471.</li>
          <li>Open LinkedIn. A profile page totals that person. The feed totals the scroll. The popup can force either.</li>
        </ol>
        <p className="text-xs leading-5 text-[#6f685e]">
          The API key stays on the server. The extension only sends post text to <code>/api/classify</code>. If you open
          this demo from another machine, copy this page’s origin into the popup and allow the permission it asks for.
        </p>
      </DialogContent>
    </Dialog>
  );
}
