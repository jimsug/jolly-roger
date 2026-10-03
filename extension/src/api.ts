export class HttpError extends Error {
  private status: number | undefined;

  constructor(msg: string, status?: number) {
    super(msg);
    Object.setPrototypeOf(this, HttpError.prototype);
    this.status = status;
  }

  getStatus(): number | undefined {
    return this.status;
  }
}

export interface Hunt {
  _id: string;
  name: string;
}

export type GdriveMimeTypesType = "spreadsheet" | "document";

/** The body of POST /api/hunts/:huntId/puzzles. */
export interface Puzzle {
  title: string;
  url: string;
  tags: string[];
  expectedAnswerCount: number;
  docType: GdriveMimeTypesType;
  allowDuplicateUrls: boolean;
}

/** A puzzle found by GET /api/hunts/:huntId/puzzles?url=... */
export interface ExistingPuzzle {
  _id: string;
  title: string;
  /** The puzzle's page in Jolly Roger. */
  jollyRogerUrl: string;
}

const huntPath = (hunt: string) => `/api/hunts/${encodeURIComponent(hunt)}`;

export class JollyRogerClient {
  private instance: string;

  private apiKey: string;

  constructor(instance: string, apiKey: string) {
    this.instance = instance;
    this.apiKey = apiKey;
  }

  getHunts = async () => {
    return (await this.callApi("/api/hunts")).hunts as Hunt[];
  };

  getTagsForHunt = async (hunt: string) => {
    return (await this.callApi(`${huntPath(hunt)}/tags`)).tags as string[];
  };

  addPuzzle = async (hunt: string, puzzle: Puzzle) => {
    // The server rejects any field it doesn't know, so send exactly these.
    const {
      title,
      url,
      tags,
      expectedAnswerCount,
      docType,
      allowDuplicateUrls,
    } = puzzle;
    return (
      await this.callApi(`${huntPath(hunt)}/puzzles`, {
        title,
        url,
        tags,
        expectedAnswerCount,
        docType,
        allowDuplicateUrls,
      })
    ).id as string;
  };

  async findPuzzlesByUrl(url: string, hunt: string): Promise<ExistingPuzzle[]> {
    const query = new URLSearchParams({ url });
    try {
      const result = await this.callApi(
        `${huntPath(hunt)}/puzzles?${query.toString()}`,
      );
      return result.puzzles as ExistingPuzzle[];
    } catch (e) {
      if (e instanceof HttpError && e.getStatus() === 404) {
        return [];
      }
      throw e;
    }
  }

  /** Maps each URL that already has a puzzle in the hunt to its page in Jolly Roger. */
  async findExistingPuzzlesByUrl(
    urls: string[],
    hunt: string,
  ): Promise<Record<string, string>> {
    const result = await this.callApi(`${huntPath(hunt)}/puzzles/bulk-check`, {
      urls,
    });
    return result.existing as Record<string, string>;
  }

  private callApi = (endpoint: string, requestBody?: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.instance);
      const xhr = new XMLHttpRequest();
      xhr.open(requestBody ? "POST" : "GET", url);
      xhr.setRequestHeader("Authorization", `Bearer ${this.apiKey}`);
      if (requestBody) {
        xhr.setRequestHeader("Content-Type", "application/json");
      }
      xhr.onload = function () {
        if (xhr.status === 200) {
          resolve(JSON.parse(xhr.response));
        } else {
          reject(
            new HttpError(
              `HTTP error ${xhr.status} calling ${url}`,
              xhr.status,
            ),
          );
        }
      };
      xhr.onerror = function () {
        reject(new HttpError(`HTTP error calling ${url}`));
      };
      xhr.send(requestBody ? JSON.stringify(requestBody) : null);
    });
  };
}
