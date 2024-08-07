import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SearchFriendDto } from './dto/search-friend.dto';
import { log } from 'console';

@Injectable()
export class FriendService {
  constructor(private prisma: PrismaService) {}

  async create(loggedId: number, username: {username:string}) {

    var user = await this.prisma.user.findUnique({
      select:{ id:true },
      where:{ username: username.username },
    })

    if (user) {
      return await this.prisma.friend.create({
        data: {
          requesterId: loggedId,
          receiverId: user.id,
        },
      });
    }

    const createError = require('http-errors');
    throw createError(401, 'Usuário inválido.');

  }
  
  async findAll(loggedId: number) {
  
    var friendsOfLoggedUser = await this.prisma.friend.findMany({
      select:{
        receiver: {
          select: {
            id: true,
            username: true,
            name: true,
            bio: true,
            picture: true,
            email:true
          }
        }  
      },
      where:{                                                                       
        requesterId: loggedId,
      },
    });

    var aux = { friendList : []}

    friendsOfLoggedUser.map(friend => aux.friendList.push(friend.receiver))

    return aux
  }

  async findFriend(loggedId: number, searchFriendDto: SearchFriendDto){

    var param = searchFriendDto.username.split(' ')
    
    var user = await this.prisma.user.findUnique({
      select:{ id:true, name:true, username:true, email:true, picture:true, bio:true },
      where:{ username: param[0] },
    })

    var friendship = await this.prisma.friend.findUnique({
      where: {
         requesterId_receiverId:{
            requesterId: +param[1],
            receiverId: user.id
         }
      }
    })

    var friend = await this.prisma.user.findUnique({
      select:{ id:true, name:true, username:true, email:true, picture:true, bio:true },
      where:{ id: friendship.receiverId },
    })

    const usersArray = []
    usersArray.push({...friend})

    return usersArray
  }

  async remove(loggedId: number, username: {username:string}) {

    var user = await this.prisma.user.findUnique({
      select:{ id:true },
      where:{ username: username.username },
    })

    return this.prisma.friend.delete({
      where: { 
        requesterId_receiverId: {
          requesterId: loggedId,
          receiverId: user.id,
        },
      },
    });
  } 
}
