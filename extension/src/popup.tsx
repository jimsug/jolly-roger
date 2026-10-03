import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Row from "react-bootstrap/Row";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import { createRoot } from "react-dom/client";
import styled from "styled-components";
import type { CreatedPuzzle, TagSelectOption } from "./AddPageForm";
import AddPageForm from "./AddPageForm";
import type { Hunt } from "./api";
import { HttpError, JollyRogerClient } from "./api";
import type { PageLink } from "./BulkAddForm";
import BulkAddForm from "./BulkAddForm";
import {
  storedOptions,
  storedRecentTags,
  storedSelectedHuntId,
} from "./storage";
import "bootstrap/dist/css/bootstrap.min.css";

const isOnSite = (url: URL, domain: string) =>
  url.hostname === domain || url.hostname.endsWith(`.${domain}`);

const guessTitle = function (url: string, tabTitle: string): string {
  if (!url || !tabTitle) {
    return tabTitle ?? "";
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    // Not a URL there's anything to learn from
    return tabTitle;
  }

  // Hunt sites whose tab titles carry more than the puzzle's name
  if (
    isOnSite(parsedUrl, "pandamagazine.com") &&
    parsedUrl.pathname.startsWith("/island") &&
    tabTitle.includes(" | ")
  ) {
    return tabTitle.slice(tabTitle.indexOf(" | ") + 3);
  }
  if (
    isOnSite(parsedUrl, "puzzlehunt.azurewebsites.net") &&
    tabTitle.includes(" - ")
  ) {
    return tabTitle.slice(0, tabTitle.lastIndexOf(" - "));
  }

  // If the title is just the URL, it means there was no anchor text.
  // In this case, we can try to guess a better title from the URL path.
  if (tabTitle === url) {
    try {
      const pathname = parsedUrl.pathname.replaceAll(/^\/|\/$/g, "");
      if (pathname) {
        const pathParts = pathname.split("/");
        const lastPart = pathParts.at(-1) ?? "";
        if (lastPart) {
          const decodedLastPart = decodeURI(lastPart);
          return (
            decodedLastPart.includes("_")
              ? decodedLastPart.replaceAll("_", " ")
              : decodedLastPart.replaceAll("-", " ")
          ).replaceAll(
            /\w\S*/g,
            (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase(),
          );
        }
      }
    } catch {
      // Fall through if the path doesn't decode
    }
  }

  // Fallback to original tab title
  return tabTitle;
};

/* Either the created puzzle, or an error for any failures. */
type Status = CreatedPuzzle | Error | undefined;

const PopupBody = styled.div`
  min-width: 500px;
`;

const Popup = () => {
  const idPrefix = useId();

  const [jollyRogerInstance, setJollyRogerInstance] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [recentTags, setRecentTags] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState<boolean>(true);

  // Load configuration / saved state from extension storage.
  useEffect(() => {
    void (async () => {
      const options = await storedOptions.get();
      setApiKey(options.apiKey);
      setJollyRogerInstance(options.jollyRogerInstance);
      setRecentTags(await storedRecentTags.get());
      setLoadingOptions(false);
    })();
  }, []);

  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [loadingHunts, setLoadingHunts] = useState<boolean>(false);
  const [hunt, setHunt] = useState<string>("");

  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loadingTags, setLoadingTags] = useState<boolean>(false);

  const [loadingPageDetails, setLoadingPageDetails] = useState<boolean>(true);
  const [pageTitle, setPageTitle] = useState<string>("");
  const [pageUrl, setPageUrl] = useState<string>("");
  const [pageLinks, setPageLinks] = useState<PageLink[]>([]);
  const [pageLinksError, setPageLinksError] = useState<string>();

  const [status, setStatus] = useState<Status>();
  const [saving, setSaving] = useState<boolean>(false);
  const [bulkSaving, setBulkSaving] = useState<boolean>(false);

  const loading = loadingOptions || loadingHunts || loadingPageDetails;

  const jollyRogerClient = useMemo(() => {
    if (!jollyRogerInstance || !apiKey) {
      return undefined;
    }
    return new JollyRogerClient(jollyRogerInstance, apiKey);
  }, [jollyRogerInstance, apiKey]);

  // Load the list of hunts from Jolly Roger, preselecting the last used hunt (if any).
  useEffect(() => {
    if (!jollyRogerClient) {
      setLoadingHunts(false);
      return;
    }
    setLoadingHunts(true);
    void (async () => {
      let huntList: Hunt[];
      try {
        huntList = await jollyRogerClient.getHunts();
      } catch (error) {
        let errorMsg: string;
        if (error instanceof HttpError) {
          errorMsg = `Unable to load hunts from Jolly Roger: ${error.message}.`;
        } else {
          errorMsg = `Unable to load hunts from Jolly Roger.`;
        }
        setStatus(new Error(errorMsg));
        setLoadingHunts(false);
        return;
      }
      const selectedHuntId = await storedSelectedHuntId.get();
      setHunts(huntList);
      if (huntList.some((huntElement) => huntElement._id === selectedHuntId)) {
        setHunt(selectedHuntId);
      } else if (huntList.length > 0) {
        setHunt(huntList[0]._id);
      } else {
        setStatus(new Error("No hunts are available"));
      }
      setLoadingHunts(false);
    })();
  }, [jollyRogerClient]);

  // Whenever a new hunt is selected, fetch the tags for that hunt for autocomplete.
  useEffect(() => {
    if (!jollyRogerClient || !hunt) {
      return;
    }
    setLoadingTags(true);
    void (async () => {
      let huntTags: string[];
      try {
        huntTags = await jollyRogerClient.getTagsForHunt(hunt);
      } catch (error) {
        let errorMsg: string;
        if (error instanceof HttpError) {
          errorMsg = `Unable to load tags from Jolly Roger: ${error.message}.`;
        } else {
          errorMsg = `Unable to load tags from Jolly Roger.`;
        }
        setStatus(new Error(errorMsg));
        setLoadingTags(false);
        return;
      }

      setAvailableTags(huntTags);
      setLoadingTags(false);
    })();
  }, [jollyRogerClient, hunt]);

  const tagOptions: TagSelectOption[] = useMemo(
    () =>
      availableTags.filter(Boolean).map((t) => {
        return { value: t, label: t };
      }),
    [availableTags],
  );

  // Read the URL and title of the current page, and all its links for bulk add.
  useEffect(() => {
    setLoadingPageDetails(true);
    void (async () => {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (activeTab) {
        const tabTitle = activeTab.title ?? "";
        const tabUrl = activeTab.url ?? "";
        setPageTitle(guessTitle(tabUrl, tabTitle));
        setPageUrl(tabUrl);

        if (activeTab.id) {
          try {
            // Note: This requires the "scripting" permission in manifest.json
            const results = await chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              func: () => {
                const links = Array.from(document.querySelectorAll("a"));
                return links
                  .filter((link) => link.href?.startsWith("http"))
                  .map((link) => ({
                    url: link.href,
                    // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- innerText is the link as shown, without hidden text
                    text: link.innerText.trim() || link.href,
                  }));
              },
            });

            if (results?.[0]?.result) {
              const linksFromPage: { url: string; text: string }[] =
                results[0].result;

              // De-duplicate links based on URL, preferring links with text over those without.
              const uniqueLinks = new Map<
                string,
                { url: string; text: string }
              >();
              for (const link of linksFromPage) {
                const existingLink = uniqueLinks.get(link.url);
                // A link has "text" if its text content is not just the URL itself.
                const hasText = link.text !== link.url;
                const existingHasText =
                  existingLink && existingLink.text !== existingLink.url;

                if (!existingLink || (hasText && !existingHasText)) {
                  uniqueLinks.set(link.url, link);
                }
              }

              setPageLinks(
                Array.from(uniqueLinks.values()).map((link, index) => ({
                  id: index,
                  url: link.url,
                  guessedTitle: guessTitle(link.url, link.text),
                  checked: true,
                })),
              );
            }
          } catch (error) {
            // Browsers don't let extensions read some pages, such as their own
            // settings and extension stores
            setPageLinksError(
              error instanceof Error
                ? `Unable to read the links on this page: ${error.message}`
                : "Unable to read the links on this page.",
            );
          }
        }
      }

      setLoadingPageDetails(false);
    })();
  }, []);

  const onHuntChange: React.ChangeEventHandler<HTMLSelectElement> = useCallback(
    (event) => {
      void (async () => {
        // Save the most recently selected hunt so it can be selected by default next time.
        await storedSelectedHuntId.put(event.target.value);
      })();
      setHunt(event.target.value);
    },
    [],
  );

  const onCloseStatusDialog = useCallback(() => {
    // If the creation was successful, close the extension.
    if (status && !(status instanceof Error)) {
      window.close();
    }
    setStatus(undefined);
  }, [status]);

  const statusMessage = useMemo(() => {
    if (!status) {
      return <>Unknown error</>;
    } else if (status instanceof Error) {
      return (
        <>
          <strong>Error:</strong> {status.message}
        </>
      );
    } else {
      const puzzleUrl = new URL(
        `/hunts/${hunt}/puzzles/${status.puzzleId}`,
        jollyRogerInstance,
      );
      return (
        <>
          Puzzle successfully created:{" "}
          <a href={puzzleUrl.href} target="_blank" rel="noreferrer">
            {status.title}
          </a>
        </>
      );
    }
  }, [jollyRogerInstance, status, hunt]);

  const onConfigureLinkClicked = useCallback(() => {
    void (async () => {
      await chrome.runtime.openOptionsPage();
    })();
  }, []);

  const contents = jollyRogerClient ? (
    <>
      <Form.Group as={Row} className="mb-3" controlId={`${idPrefix}-hunt`}>
        <Form.Label column xs={3}>
          Hunt
        </Form.Label>
        <Col xs={9}>
          <Form.Select
            value={hunt}
            onChange={onHuntChange}
            disabled={loadingTags || saving || bulkSaving}
          >
            {hunts.map((huntItem) => {
              return (
                <option key={huntItem._id} value={huntItem._id}>
                  {huntItem.name}
                </option>
              );
            })}
          </Form.Select>
        </Col>
      </Form.Group>
      <Tabs
        defaultActiveKey="add-page"
        id="popup-tabs"
        className="mb-3"
        mountOnEnter
      >
        <Tab eventKey="add-page" title="Add page">
          <AddPageForm
            client={jollyRogerClient}
            hunt={hunt}
            tagOptions={tagOptions}
            loadingTags={loadingTags}
            initialRecentTags={recentTags}
            initialTitle={pageTitle}
            url={pageUrl}
            saving={saving}
            onSavingChange={setSaving}
            onResult={setStatus}
          />
        </Tab>
        <Tab eventKey="bulk-add" title="Bulk add">
          <BulkAddForm
            client={jollyRogerClient}
            hunt={hunt}
            tagOptions={tagOptions}
            initialLinks={pageLinks}
            linksError={pageLinksError}
            saving={bulkSaving}
            onSavingChange={setBulkSaving}
          />
        </Tab>
      </Tabs>
    </>
  ) : (
    <Button variant="link" onClick={onConfigureLinkClicked}>
      Configure Jolly Roger extension
    </Button>
  );

  return (
    <PopupBody className="p-3">
      {loading ? <div>loading...</div> : contents}
      <Modal show={status !== undefined} onHide={onCloseStatusDialog} centered>
        <Modal.Body>{statusMessage}</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onCloseStatusDialog}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </PopupBody>
  );
};

const root = createRoot(document.querySelector("#root")!);

root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
