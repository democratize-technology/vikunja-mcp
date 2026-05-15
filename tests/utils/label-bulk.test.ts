import { setTaskLabels } from '../../src/utils/label-bulk';

describe('setTaskLabels', () => {
  it('sends the { labels: [{ id }] } body shape that Vikunja requires', async () => {
    const updateTaskLabels = jest.fn().mockResolvedValue({});
    const client = { tasks: { updateTaskLabels } };

    await setTaskLabels(client as never, 42, [3, 8]);

    expect(updateTaskLabels).toHaveBeenCalledWith(42, {
      labels: [{ id: 3 }, { id: 8 }],
    });
  });

  it('sends an empty labels array to clear every label', async () => {
    const updateTaskLabels = jest.fn().mockResolvedValue({});
    const client = { tasks: { updateTaskLabels } };

    await setTaskLabels(client as never, 7, []);

    expect(updateTaskLabels).toHaveBeenCalledWith(7, { labels: [] });
  });

  it('propagates errors from the API client', async () => {
    const updateTaskLabels = jest.fn().mockRejectedValue(new Error('boom'));
    const client = { tasks: { updateTaskLabels } };

    await expect(setTaskLabels(client as never, 1, [1])).rejects.toThrow('boom');
  });
});
