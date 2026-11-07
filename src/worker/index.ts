export default {
  async fetch(): Promise<Response> {
    return new Response("study-record", { status: 200 });
  },
};
