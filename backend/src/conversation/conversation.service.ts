import { Injectable,forwardRef,Inject } from '@nestjs/common';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { PrismaService } from '../prisma.service';
import { MessageService } from '../message/message.service';
import { UserConversationService } from '../user-conversation/user-conversation.service';

@Injectable()
export class ConversationService {
  constructor(
    private prisma: PrismaService, 
    private userConversationService: UserConversationService,
    @Inject(forwardRef(() => MessageService))
    private messageService: MessageService,
  ) {}

  async createGroupConversation(loggedId: number, createConversationDto: CreateConversationDto){
    const { ids, ...conversationData } = createConversationDto;
    const {conversation, createMessage} = await this.prisma.$transaction(async p => {
    
      // add conversation
      const conversation = await this.prisma.conversation.create({
        data: conversationData
      });

      // add owner
      const owner = await this.userConversationService.create({
        userId: loggedId,
        conversationId: conversation.id,
        owner: true
      });

      // add ghost-user
      const ghostUser = await this.userConversationService.create({
        userId: 0,
        conversationId: conversation.id,
        owner: false
      });
      
      // Create the 'create group' message from system
      const createMessage = (await this.messageService.sendMessage(
        {content: "'" + owner.user.username + "' criou o grupo '" + conversation.name + "'."},
        0, //ghost-user Id
        conversation.id
      )).content;

      return {
        conversation: conversation,
        createMessage: createMessage
      }
    });
    
    const addMessages = await this.userConversationService.addUsers(loggedId, conversation.id, {ids: ids});

    return {
      createMessage: createMessage,
      addMessages: addMessages
    };
  }

  async createSimpleConversation(loggedId: number, createConversationDto: CreateConversationDto){
    const { ids, ...conversationData } = createConversationDto;
    const conversationId = await this.checkIfSimpleConversationExists(loggedId, ids[0]);
    
    if (conversationId){
      await this.userConversationService.returnToConversation(loggedId, conversationId);
      
      const loggedUser = (await this.prisma.user.findUnique({where:{id: loggedId}})).username;
      const otherUser = (await this.prisma.user.findUnique({where:{id: ids[0]}})).username;
      
      return {returnMessage: "'" + loggedUser + "' voltou à conversa com '" + otherUser + "'."};
    }

    // add conversation
    const conversation = await this.prisma.conversation.create({
      data: conversationData
    });

    // add logged user
    const loggedUser = await this.userConversationService.create({
      userId: loggedId,
      conversationId: conversation.id,
      owner: false
    });

    // add other user
    const otherUser = await this.userConversationService.create({
      userId: ids[0],
      conversationId: conversation.id,
      owner: false
    });

    // add ghost-user
    const ghostUser = await this.userConversationService.create({
      userId: 0,
      conversationId: conversation.id,
      owner: false
    });
    
    // Create the 'begin conversation' message from system
    const beginMessage = (await this.messageService.sendMessage(
      {content: "'" + loggedUser.user.username + "' iniciou uma conversa com '" + otherUser.user.username + "'."},
      0, //ghost-user Id
      conversation.id
    )).content;

    return {beginMessage};
  }

  async checkIfSimpleConversationExists(loggedId: number, otherId: number){
    
    const loggedIdConversations = (await this.prisma.userConversation.findMany({
      select:{
        conversationId: true
      },
      where: {
        userId: loggedId,
        conversation: {
          isGroup: false
        }
      }
    })).map(uc => uc.conversationId);

    const otherIdConversations = (await this.prisma.userConversation.findMany({
        select:{
          conversationId: true
        },
        where: {
          userId: otherId,
          conversation: {
            isGroup: false
          }
        }
    })).map(uc => uc.conversationId);

    return loggedIdConversations.filter(uc => otherIdConversations.includes(uc))[0];
  };

  async getRecentConversations(loggedId: number) {

    var conversationsOfLoggedUser = await this.getConversationsOfLoggedUser(loggedId);

    var conversationIdsOfLoggedUser = conversationsOfLoggedUser.map(conversation => conversation.conversationId);
    var favoritedConversationsIdsOfLoggedUser = conversationsOfLoggedUser
      .filter(conversation => conversation.favorited === true)
      .map(conversation => conversation.conversationId);
    
    var recentMessagesByDate = await this.getRecentMessagesByDate(conversationIdsOfLoggedUser);

    var recentConversationsIdsOfLoggedUser = recentMessagesByDate.map(conversation=> conversation.conversationId);        
    var nonFavoritedRecentConversationsIds = recentConversationsIdsOfLoggedUser.filter(
      conversationId => !(favoritedConversationsIdsOfLoggedUser.includes(conversationId))  
    );

    var recentConversationsIds = favoritedConversationsIdsOfLoggedUser.concat(nonFavoritedRecentConversationsIds);

    var recentConversations = [];
    for (var conversationId of recentConversationsIds) {
      var conversation = await this.prisma.conversation.findUnique({                    
        where: {
          id: conversationId,                                              
        },
        include:{
          userConversations:{
            select:{
              favorited: true,
            },
            where:{
              userId: loggedId,
            }
          }
        }
      });
      const {userConversations, ...conversationWithoutUserConversations } = conversation;

      const mergedInfos = {
        ...conversationWithoutUserConversations,
        favorited: userConversations[0].favorited
      };
      
      recentConversations.push(mergedInfos);
    }

    return recentConversations;
}
  async getConversationsOfLoggedUser(loggedId: number)
  {
      var conversationIdsOfLoggedUser = await this.prisma.userConversation.findMany({
      select:{
        conversationId: true,
        favorited: true
      },
      where:{                                                                       
        userId: loggedId,
        leftConversation: false,
      },
    })
      return conversationIdsOfLoggedUser;
  }

  async getRecentMessagesByDate(conversationIdsOfLoggedUser :number[]){
    var recentMessagesByDate = await this.prisma.message.findMany({ 
      select: {
        conversationId: true,
        createdAt: true,
      },
      orderBy: {
        id: 'desc',
      },
      where:{
        conversationId:{
          in: conversationIdsOfLoggedUser,                  
        },
      },
      distinct: ['conversationId'],
    });
    return recentMessagesByDate;
  }

  async findOne(loggedId: number, conversationId: number) {
    var userConversation = await this.userConversationService.findOne(loggedId, conversationId);
    var conversation = userConversation.conversation;
    var messagesFromConversation = await this.messageService.findAllMessagesFromConversation(loggedId, conversationId);
    var conversationAndMessages = {
      conversation: conversation,
      messages: messagesFromConversation
    }
    return conversationAndMessages
  }

  async getConversationInfo(loggedId: number, conversationId: number){
    const conversationInfo = await this.prisma.conversation.findUnique({
      where: {
        id: conversationId,
        userConversations :{
          some: {
            userId: loggedId,
          }
        }
      }
    });
    
    // Group Conversation
    if (conversationInfo.isGroup){
      const isOwner = (await this.prisma.userConversation.findUnique({
        where: { 
          userId_conversationId: {
            userId: loggedId,
            conversationId: conversationId
          }
        },
        select: {
          owner: true
        }
      })).owner;
      const participantsInfo = await this.prisma.userConversation.findMany({
        where:{
          conversationId: conversationId,
          userId: {
            not: 0 //ghost-user Id
          }
        },
        select:{
          user:{
            select:{
              id: true,
              name: true,
              username: true,
              picture: true,
            },
          }
        }
      });

      return {
        owner: isOwner,
        conversation: conversationInfo,
        participants: participantsInfo.map(p => p.user),
      }
    }

    // Single Conversation (DM)
    else{ 
      const user = await this.prisma.user.findFirst({
        select:{
          id: true,
          name: true,
          username: true,
          email: true,
          picture: true,
          bio: true  
        },
        where: {
          id :{
            notIn: [loggedId, 0],  //loggedId and ghost-user Id
          },
          conversations: {
            some: {
              conversationId: conversationId
            }
          }
        }
      });

      return user
    }
  }

  async updateGroupName(loggedId: number, conversationId: number, name: {name: string}) {
    let user = await this.prisma.userConversation.findUnique({
      select:{
        owner: true,
        user: true
      },
      where:{
        userId_conversationId:{
          conversationId: conversationId,
          userId: loggedId
        }
      }
    });
    if (user.owner == true) {
      let message = (await this.prisma.$transaction([
        this.prisma.conversation.update({
          where: {
            id: conversationId
          },
          data: {
            name: name.name
          },
        }),
        this.prisma.message.create({
          data: {
            content: "'" + user.user.username + "' alterou o nome do grupo para '" + name.name + "'.",
            senderId: 0,
            conversationId: conversationId
          }
        })
      ]))[1];
      return {newNameMessage: message.content}
    }

  }

  async removeAll(loggedId:number, conversationId: number) {
    const userConversation = await this.prisma.userConversation.findUnique({
      where: {
        userId_conversationId: {
          userId: loggedId,
          conversationId: conversationId
        },
        owner: true
      },
    });

    const conversation = await this.prisma.conversation.delete({
      where: {
        id: userConversation.conversationId
      },
    });

    return {destroyMessage: "Grupo '" + conversation.name + "' deletado completamente."}
  }
}
