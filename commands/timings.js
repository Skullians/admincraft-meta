const analyzeTimings = require('../functions/analyzeTimings.js');
const { EmbedBuilder, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
module.exports = {
	name: 'timings',
	description: 'Analyze Paper timings to help optimize your server.',
	args: true,
	usage: '<Timings Link>',
	options: [{
		'type': ApplicationCommandOptionType.String,
		'name': 'url',
		'description': 'The Timings URL',
		'required': true,
	}],
	async execute(message, args, client) {
		if (message.type == 2) await message.deferReply({ ephemeral: true });

		try {
			const timingsresult = await analyzeTimings(message, client, args);
			// send the timings result or  an error message if the result is invalid. Smartly handle the message type (slash or normal)
			const timingsmsg = await (message.type === 2 ? message.editReply(timingsresult ? timingsresult[0] : 'Invalid Timings URL.') : message.reply(timingsresult ? timingsresult[0] : 'Invalid Timings URL.'));
			if (!timingsresult) return;

			// Get the issues from the timings result
			const suggestions = timingsresult[1];
			if (!suggestions) return;
			const filter = i => i.user.id == (message.author ?? message.user).id && i.customId.startsWith('analysis_');
			const collector = timingsmsg.createMessageComponentCollector({ filter, time: 300000 });
			collector.on('collect', async i => {
				// Defer button
				await i.deferUpdate();

				// Get the embed
				const TimingsEmbed = new EmbedBuilder(i.message.embeds[0].toJSON());
				const footer = TimingsEmbed.toJSON().footer;

				// Force analysis button
				if (i.customId == 'analysis_force') {
					const fields = [...suggestions];
					const components = [];
					if (suggestions.length >= 13) {
						fields.splice(12, suggestions.length, { name: '✅ Your server isn\'t lagging', value: `**Plus ${suggestions.length - 12} more recommendations**\nClick the buttons below to see more` });
						components.push(
							new ActionRowBuilder()
								.addComponents([
									new ButtonBuilder()
										.setCustomId('analysis_prev')
										.setEmoji({ name: '⬅️' })
										.setStyle(ButtonStyle.Secondary),
									new ButtonBuilder()
										.setCustomId('analysis_next')
										.setEmoji({ name: '➡️' })
										.setStyle(ButtonStyle.Secondary),
									new ButtonBuilder()
										.setURL(process.env.GITHUB_URL)
										.setLabel('source')
										.setStyle(ButtonStyle.Link),
								]),
						);
					}
					TimingsEmbed.setFields(fields);

					// Send the embed
					return i.editReply({ embeds: [TimingsEmbed], components });
				}

				// Calculate total amount of pages and get current page from embed footer
				const text = footer.text.split(' • ');
				const lastPage = parseInt(text[text.length - 1].split('Page ')[1].split(' ')[0]);
				const maxPages = parseInt(text[text.length - 1].split('Page ')[1].split(' ')[2]);

				// Get next page (if last page, go to pg 1)
				const page = i.customId == 'analysis_next' ? lastPage == maxPages ? 1 : lastPage + 1 : lastPage - 1 ? lastPage - 1 : maxPages;
				const end = page * 12;
				const start = end - 12;
				const fields = suggestions.slice(start, end);

				// Update the embed
				text[text.length - 1] = `Page ${page} of ${Math.ceil(suggestions.length / 12)}`;
				TimingsEmbed
					.setFields(fields)
					.setFooter({ iconURL: footer.icon_url, text: text.join(' • ') });

				// Send the embed
				i.editReply({ embeds: [TimingsEmbed] });
			});

			// When the collector stops, remove all buttons from it
			collector.on('end', () => {
				if (message.commandName) message.editReply({ components: [] }).catch(err => client.logger.warn(err));
				else timingsmsg.edit({ components: [] }).catch(err => client.logger.warn(err));
			});
		}
		catch (err) { client.error(err, message); }
	},
};